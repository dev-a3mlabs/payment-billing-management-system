import bcrypt from 'bcrypt';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { LOGIN_BLOCK_REASONS } from '../../config/login-block-reasons.js';
import { ROLE_PORTAL, type Portal } from '../../config/portals.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { Prisma, type User, type UserSession } from '../../generated/prisma/client.js';
import { ActivityStatus, LoginStatus, Role, UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/token.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { mfaRepository } from '../mfa/mfa.repository.js';
import { mfaService } from '../mfa/mfa.service.js';
import { userService } from '../user/user.service.js';
import { userSecurityService } from '../user-security/user-security.service.js';
import { sessionRepository } from '../session/session.repository.js';
import { sessionService } from '../session/session.service.js';
import { authRepository } from './auth.repository.js';
import { isDeviceAllowed } from './device-limit.js';
import { toLoginEventData } from './login-event.js';
import { checkLoginRisk, LOGIN_VERIFICATION_FAILED, type FingerprintLookup } from './login-risk.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import type { ChangePasswordInput, LoginInput, LoginMfaInput } from './v1/auth.schema.js';
import { fingerprintService } from '../../integrations/fingerprint/fingerprint.service.js';
import { cloudflareService } from '../../integrations/cloudflare/cloudflare.service.js';
import { logger } from '../../utils/logger.js';

// Compared against when the username doesn't exist, so the response takes the same time either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const INVALID_CREDENTIALS = 'Invalid credentials';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';
const INVALID_MFA_TOKEN = 'Your login has expired. Please log in again.';
const INVALID_MFA_CODE = 'Invalid code';
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
const ACCOUNT_LOCKED = 'Your account is locked. Please contact your administrator.';
const TEMP_PASSWORD_USED = 'Your temporary password has already been used. Please contact your admin to reset it.';
export const LOGIN_TEMPORARILY_UNAVAILABLE =
  'We could not complete your login right now. Please try again later.';

// Refresh tokens never outlive their session, so a session lasts at most REFRESH_TOKEN_EXPIRES_DAYS.
const issueTokens = async (user: User, session: UserSession) => {
  const refreshToken = generateRefreshToken();

  await authRepository.createRefreshToken({
    sessionId: session.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: session.expiresAt,
  });

  return {
    accessToken: signAccessToken({
      sub: user.uuid,
      role: user.role,
      portal: session.portal as Portal,
      sid: session.uuid,
    }),
    refreshToken,
  };
};

// A refresh token used twice means it was copied, so log the user out of every device.
const handleTokenReuse = async (userId: number, sessionId: number, client: ClientInfo) => {
  const { count } = await authRepository.revokeAllSessions(userId, SESSION_REVOKE_REASONS.reuseDetected);

  await activityLogService.record(
    {
      action: ACTIVITY_ACTIONS.tokenReuseDetected,
      status: ActivityStatus.failed,
      targetUserId: userId,
      sessionId,
      metadata: { revokedSessions: count },
    },
    client,
  );

  throw ApiError.unauthorized(INVALID_REFRESH_TOKEN, ERROR_CODES.INVALID_REFRESH_TOKEN);
};

// event_id is the only unique column a login can collide on, so P2002 means a replayed event.
const guardEventReuse = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.forbidden(LOGIN_VERIFICATION_FAILED, ERROR_CODES.LOGIN_BLOCKED);
    }
    throw err;
  }
};

type LoginUser = NonNullable<Awaited<ReturnType<typeof authRepository.findUserById>>>;

const recordBlockedLogin = (
  user: LoginUser,
  portal: Portal,
  lookup: FingerprintLookup,
  client: ClientInfo,
  blockReason: string,
) =>
  guardEventReuse(() =>
    authRepository.createLoginEvent({
      userId: user.id,
      portal,
      status: LoginStatus.blocked,
      blockReason,
      ...toLoginEventData(lookup.event, client),
    }),
  );

// Checked before any login writes, so a blocked login doesn't burn the temp password.
const checkDevice = async (user: LoginUser, eventId: string, portal: Portal, client: ClientInfo) => {
  const lookup = await fingerprintService.getEvent(eventId).then(
    (event) => ({ event, failed: false }),
    (err) => {
      logger.warn('Fingerprint lookup failed:', err);
      return { event: null, failed: true };
    },
  );

  const block = checkLoginRisk(lookup);
  if (block) {
    await recordBlockedLogin(user, portal, lookup, client, block.reason);
    throw ApiError.forbidden(block.message, ERROR_CODES.LOGIN_BLOCKED);
  }

  return lookup;
};

const startSession = async (user: LoginUser, portal: Portal, lookup: FingerprintLookup, client: ClientInfo) => {
  const visitorId = lookup.event?.identification.visitor_id;

  // All login writes succeed or fail together, so a rejected login never burns the temp password.
  const session = await guardEventReuse(() =>
    withTransaction(async (tx) => {
      // Returns before any write, so a blocked login changes nothing.
      if (visitorId && !(await isDeviceAllowed(user, visitorId, tx))) return null;

      await authRepository.updateLastLogin(user.id, tx);

      if (user.security?.failedLoginAttempts) {
        await userSecurityService.resetAttempts(user.id, tx);
      }

      // One session per device: a new login replaces the old session on the same browser.
      if (visitorId) {
        await sessionRepository.revokeDevice(user.id, visitorId, SESSION_REVOKE_REASONS.sameDeviceLogin, tx);
      }

      const created = await authRepository.createSession(
        {
          userId: user.id,
          portal,
          ...client,
          visitorId,
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
        },
        tx,
      );

      await authRepository.createLoginEvent(
        {
          userId: user.id,
          sessionId: created.id,
          portal,
          status: LoginStatus.success,
          ...toLoginEventData(lookup.event, client),
        },
        tx,
      );

      return created;
    }),
  );

  if (!session) {
    await recordBlockedLogin(user, portal, lookup, client, LOGIN_BLOCK_REASONS.deviceLimit);
    throw ApiError.forbidden(
      'You are logged in on the maximum number of devices. Please log out from another device and try again.',
      ERROR_CODES.DEVICE_LIMIT_REACHED,
    );
  }

  return {
    mfaRequired: false as const,
    mustChangePassword: user.mustChangePassword,
    mfaSetupRequired: !(await mfaService.isEnabled(user.id)) && (await mfaService.isRequired(user)),
    ...(await issueTokens(user, session)),
    user: {
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      countryCode: user.countryCode,
      mobileNumber: user.mobileNumber,
      status: user.status,
    },
  };
};

export const authService = {
  login: async ({ username, password, eventId, IdentityToken }: LoginInput, portal: Portal, client: ClientInfo) => {


    if (IdentityToken) {
      
      const captcha = await cloudflareService.verifyTurnstile(IdentityToken);

      if (!captcha.ok) {
        // The real reason stays in the server log only.
        logger.warn('Turnstile check failed:', captcha.reason, captcha.errorCodes);

        if (captcha.reason === 'verification-unavailable') {
          throw ApiError.forbidden(LOGIN_TEMPORARILY_UNAVAILABLE, ERROR_CODES.CAPTCHA_UNAVAILABLE);
        }
        throw ApiError.forbidden(LOGIN_VERIFICATION_FAILED, ERROR_CODES.CAPTCHA_FAILED);
      }
    }

    const user = await authRepository.findUserByUsername(username);

    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    // A deleted account looks the same as one that never existed.
    if (!user || user.status === UserStatus.deleted) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!passwordMatches) {
      const { locked, remainingAttempts } = await userSecurityService.recordFailedLogin(user, client);
      await authRepository.createLoginEvent({
        userId: user.id,
        portal,
        status: LoginStatus.failed,
        blockReason: LOGIN_BLOCK_REASONS.wrongPassword,
        ...toLoginEventData(null, client),
      });
      if (locked) {
        throw ApiError.forbidden(ACCOUNT_LOCKED, ERROR_CODES.ACCOUNT_LOCKED);
      }
      throw ApiError.unauthorized(
        remainingAttempts === null
          ? INVALID_CREDENTIALS
          : `${INVALID_CREDENTIALS}. ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} left before your account is locked.`,
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    if (user.security?.lockedAt) {
      await authRepository.createLoginEvent({
        userId: user.id,
        portal,
        status: LoginStatus.blocked,
        blockReason: LOGIN_BLOCK_REASONS.accountLocked,
        ...toLoginEventData(null, client),
      });
      throw ApiError.forbidden(ACCOUNT_LOCKED, ERROR_CODES.ACCOUNT_LOCKED);
    }

    // Same message as a wrong password, so other portals' accounts aren't revealed.
    if (ROLE_PORTAL[user.role] !== portal) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!userService.isActive(user)) {
      throw ApiError.forbidden('Your account is not active. Please contact your admin.', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    const lookup = await checkDevice(user, eventId, portal, client);

    // With MFA on, the session is only created once loginMfa checks the code.
    if (await mfaService.isEnabled(user.id)) {
      const mfaToken = await mfaService.createChallenge(user.id, portal, lookup.event?.identification.visitor_id);
      return { mfaRequired: true as const, mfaToken };
    }

    return startSession(user, portal, lookup, client);
  },

  loginMfa: async ({ mfaToken, code, eventId }: LoginMfaInput, portal: Portal, client: ClientInfo) => {
    const challenge = await mfaRepository.findChallenge(hashToken(mfaToken));
    if (!challenge || challenge.usedAt || challenge.expiresAt < new Date() || challenge.portal !== portal) {
      throw ApiError.unauthorized(INVALID_MFA_TOKEN, ERROR_CODES.INVALID_MFA_TOKEN);
    }

    // The account may have changed since the password step.
    const user = await authRepository.findUserById(challenge.userId);
    if (!user || user.status === UserStatus.deleted || ROLE_PORTAL[user.role] !== portal) {
      throw ApiError.unauthorized(INVALID_MFA_TOKEN, ERROR_CODES.INVALID_MFA_TOKEN);
    }
    if (user.security?.lockedAt) {
      throw ApiError.forbidden(ACCOUNT_LOCKED, ERROR_CODES.ACCOUNT_LOCKED);
    }
    if (!userService.isActive(user)) {
      throw ApiError.forbidden('Your account is not active. Please contact your admin.', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    // The code must come from the same device that entered the password.
    const lookup = await checkDevice(user, eventId, portal, client);
    if ((lookup.event?.identification.visitor_id ?? null) !== challenge.visitorId) {
      await recordBlockedLogin(user, portal, lookup, client, LOGIN_BLOCK_REASONS.deviceMismatch);
      throw ApiError.forbidden(LOGIN_VERIFICATION_FAILED, ERROR_CODES.LOGIN_BLOCKED);
    }

    if (!(await mfaService.verifyCode(user.id, code))) {
      const { attempts } = await mfaRepository.addChallengeAttempt(challenge.id);
      if (attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
        await mfaRepository.closeChallenge(challenge.id);
      }

      // Nobody can unlock the super admin, so their wrong codes don't lock the account; the limit above still applies.
      const { locked } = await userSecurityService.recordFailedLogin(user, client, user.role !== Role.super_admin);
      await authRepository.createLoginEvent({
        userId: user.id,
        portal,
        status: LoginStatus.failed,
        blockReason: LOGIN_BLOCK_REASONS.wrongMfaCode,
        ...toLoginEventData(null, client),
      });
      if (locked) {
        throw ApiError.forbidden(ACCOUNT_LOCKED, ERROR_CODES.ACCOUNT_LOCKED);
      }
      throw ApiError.unauthorized(INVALID_MFA_CODE, ERROR_CODES.INVALID_MFA_CODE);
    }

    // Two requests racing with the same challenge: only one can close it.
    if ((await mfaRepository.closeChallenge(challenge.id)).count === 0) {
      throw ApiError.unauthorized(INVALID_MFA_TOKEN, ERROR_CODES.INVALID_MFA_TOKEN);
    }

    return startSession(user, portal, lookup, client);
  },

  refresh: async (refreshToken: string, portal: Portal, client: ClientInfo) => {
    const stored = await authRepository.findRefreshToken(hashToken(refreshToken));
    if (!stored) {
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN, ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const { session } = stored;
    const { user } = session;

    if (stored.revokedAt) {
      return handleTokenReuse(user.id, session.id, client);
    }

    if (
      !sessionService.isActive(session) ||
      stored.expiresAt < new Date() ||
      session.portal !== portal ||
      !userService.isActive(user) ||
      ROLE_PORTAL[user.role] !== portal
    ) {
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN, ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    // Two requests racing with the same token: only one can revoke it, the other counts as reuse.
    const { count } = await authRepository.revokeRefreshToken(stored.id);
    if (count === 0) {
      return handleTokenReuse(user.id, session.id, client);
    }

    await authRepository.touchSession(session.id);

    return issueTokens(user, session);
  },

  changePassword: async ({ currentPassword, newPassword }: ChangePasswordInput, user: AuthUser, client: ClientInfo) => {
    const passwordHash = await authRepository.findPasswordHash(user.id);
    if (!passwordHash) {
      throw ApiError.notFound('User not found');
    }

    if (!(await bcrypt.compare(currentPassword, passwordHash))) {
      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.passwordChange,
          status: ActivityStatus.failed,
          actorId: user.id,
          targetUserId: user.id,
          sessionId: user.sessionId,
          metadata: { reason: 'wrong_current_password' },
        },
        client,
      );
      throw ApiError.badRequest('Current password is incorrect', ERROR_CODES.INVALID_CURRENT_PASSWORD);
    }

    const revokedSessions = await authRepository.updatePassword(
      user.id,
      await bcrypt.hash(newPassword, 10),
      user.sessionId,
    );

    await activityLogService.record(
      {
        action: ACTIVITY_ACTIONS.passwordChange,
        status: ActivityStatus.success,
        actorId: user.id,
        targetUserId: user.id,
        sessionId: user.sessionId,
        metadata: { revokedSessions },
      },
      client,
    );
  },

  logout: async (refreshToken: string) => {
    const stored = await authRepository.findRefreshToken(hashToken(refreshToken));
    if (stored) {
      await authRepository.revokeSession(stored.sessionId, SESSION_REVOKE_REASONS.logout);
    }
  },
};
