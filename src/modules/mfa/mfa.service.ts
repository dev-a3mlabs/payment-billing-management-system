import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { ACCESS_KEYS } from '../../config/access-keys.js';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { MFA_METHODS, type MfaMethod } from '../../config/mfa-methods.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { decrypt, encrypt } from '../../utils/encryption.js';
import type { ClientInfo } from '../../utils/request.js';
import { hashToken } from '../../utils/token.js';
import { accessService } from '../access/access.service.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { userRepository } from '../user/user.repository.js';
import { mfaRepository } from './mfa.repository.js';
import { createTotpSecret, matchTotp, totpUri } from './totp.js';
import type { DisableMfaInput } from '../profile/v1/profile.schema.js';

const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const PENDING_SECRET_REUSE_MS = 10 * 60 * 1000;

const INVALID_CODE = 'Invalid code';

type MfaUser = { id: number; role: Role };

// 16 hex characters shown as xxxx-xxxx-xxxx-xxxx.
const createRecoveryCode = () => randomBytes(8).toString('hex').replace(/(.{4})(?!$)/g, '$1-');

// Dashes, spaces and case don't matter when the user types a code back.
const hashRecoveryCode = (code: string) => hashToken(code.toLowerCase().replace(/[^0-9a-f]/g, ''));

// The super admin always needs MFA; admins and agents only when the policy is on.
const isRequired = async (user: MfaUser) =>
  user.role === Role.super_admin || accessService.hasPermission(user, ACCESS_KEYS.mfaRequired);

const isEnabled = async (userId: number) => Boolean((await mfaRepository.findByUserId(userId))?.enabledAt);

// Checks a 6-digit app code or a one-time recovery code and uses it up; returns which one matched, or null.
const verifyCode = async (userId: number, code: string): Promise<MfaMethod | null> => {
  const mfa = await mfaRepository.findByUserId(userId);
  if (!mfa?.enabledAt) return null;

  if (/^\d{6}$/.test(code)) {
    const step = matchTotp(decrypt(mfa.secretEncrypted), code);
    return step !== null && (await mfaRepository.useStep(userId, step)).count > 0 ? MFA_METHODS.totp : null;
  }
  return (await mfaRepository.useRecoveryCode(userId, hashRecoveryCode(code))).count > 0
    ? MFA_METHODS.recoveryCode
    : null;
};

export const mfaService = {
  isRequired,
  isEnabled,
  verifyCode,

  getStatus: async (user: MfaUser) => {
    const [enabled, required] = await Promise.all([isEnabled(user.id), isRequired(user)]);
    return { enabled, required };
  },

  // A recent pending secret is returned again, so a repeated call (double click, refresh, a screen
  // that renders twice) can't replace the secret behind a QR code the user already scanned.
  setup: async (user: AuthUser, client: ClientInfo) => {
    const mfa = await mfaRepository.findByUserId(user.id);
    if (mfa?.enabledAt) {
      throw ApiError.conflict('MFA is already enabled');
    }

    let secret: string;
    if (mfa && Date.now() - mfa.updatedAt.getTime() < PENDING_SECRET_REUSE_MS) {
      secret = decrypt(mfa.secretEncrypted);
    } else {
      secret = createTotpSecret();
      try {
        await mfaRepository.savePendingSecret(user.id, encrypt(secret));
      } catch (err) {
        // Another setup request for this user created the row at the same moment.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw ApiError.conflict('MFA setup is already in progress. Please try again.');
        }
        throw err;
      }

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.mfaSetup,
          status: ActivityStatus.success,
          actorId: user.id,
          targetUserId: user.id,
          sessionId: user.sessionId,
        },
        client,
      );
    }

    return { secret, qrCode: await QRCode.toDataURL(totpUri(secret, await userRepository.findUsername(user.id))) };
  },

  // Recovery codes are only stored hashed, so this is the only time they can be shown.
  enable: async (code: string, user: AuthUser, client: ClientInfo) => {
    const mfa = await mfaRepository.findByUserId(user.id);
    if (mfa?.enabledAt) {
      throw ApiError.conflict('MFA is already enabled');
    }
    if (!mfa) {
      throw ApiError.badRequest('Please start MFA setup first');
    }

    const step = matchTotp(decrypt(mfa.secretEncrypted), code);
    if (step === null) {
      throw ApiError.badRequest(INVALID_CODE, ERROR_CODES.INVALID_MFA_CODE);
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);

    await withTransaction(async (tx) => {
      await mfaRepository.enable(user.id, step, recoveryCodes.map(hashRecoveryCode), tx);
      await authRepository.revokeOtherSessions(user.id, user.sessionId, SESSION_REVOKE_REASONS.mfaEnabled, tx);
      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.mfaEnable,
          status: ActivityStatus.success,
          actorId: user.id,
          targetUserId: user.id,
          sessionId: user.sessionId,
        },
        client,
        tx,
      );
    });

    return { recoveryCodes };
  },

  disable: async ({ password, code }: DisableMfaInput, user: AuthUser, client: ClientInfo) => {
    if (await isRequired(user)) {
      throw ApiError.forbidden('MFA is required for your account');
    }
    if (!(await isEnabled(user.id))) {
      throw ApiError.badRequest('MFA is not enabled');
    }

    const passwordHash = await authRepository.findPasswordHash(user.id);
    if (!passwordHash || !(await bcrypt.compare(password, passwordHash)) || !(await verifyCode(user.id, code))) {
      throw ApiError.badRequest('Invalid password or code', ERROR_CODES.INVALID_MFA_CODE);
    }

    await withTransaction(async (tx) => {
      await mfaRepository.remove(user.id, tx);
      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.mfaDisable,
          status: ActivityStatus.success,
          actorId: user.id,
          targetUserId: user.id,
          sessionId: user.sessionId,
        },
        client,
        tx,
      );
    });
  },

  // For a user who lost their phone: removes MFA and logs them out everywhere.
  reset: (userId: number, actorId: number, client: ClientInfo) =>
    withTransaction(async (tx) => {
      if ((await mfaRepository.remove(userId, tx)) === 0) return;

      await authRepository.revokeAllSessions(userId, SESSION_REVOKE_REASONS.mfaReset, tx);
      await activityLogService.record(
        { action: ACTIVITY_ACTIONS.mfaReset, status: ActivityStatus.success, actorId, targetUserId: userId },
        client,
        tx,
      );
    }),

  // Only the hash is stored, so a leaked DB can't be used to finish someone's login.
  createChallenge: async (userId: number, portal: string, visitorId: string | undefined) => {
    const token = randomBytes(32).toString('base64url');
    await mfaRepository.createChallenge({
      userId,
      tokenHash: hashToken(token),
      portal,
      visitorId,
      expiresAt: new Date(Date.now() + CHALLENGE_EXPIRES_MS),
    });
    return token;
  },
};
