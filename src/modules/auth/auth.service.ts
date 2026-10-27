import bcrypt from 'bcrypt';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { LOGIN_BLOCK_REASONS } from '../../config/login-block-reasons.js';
import { ROLE_PORTAL, type Portal } from '../../config/portals.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { Prisma, type User, type UserSession } from '../../generated/prisma/client.js';
import { ActivityStatus, LoginStatus, UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/token.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { userService } from '../user/user.service.js';
import { userSecurityService } from '../user-security/user-security.service.js';
import { authRepository } from './auth.repository.js';
import { toLoginEventData } from './login-event.js';
import { checkLoginRisk, LOGIN_VERIFICATION_FAILED } from './login-risk.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import type { ChangePasswordInput, LoginInput } from './v1/auth.schema.js';
import { fingerprintService } from '../../integrations/fingerprint/fingerprint.service.js';
import { logger } from '../../utils/logger.js';

// Compared against when the username doesn't exist, so the response takes the same time either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const INVALID_CREDENTIALS = 'Invalid credentials';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';
const TEMP_PASSWORD_USED = 'Your temporary password has already been used. Please contact your admin to reset it.';

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

export const authService = {
  login: async ({ username, password, eventId }: LoginInput, portal: Portal, client: ClientInfo) => {
    const user = await authRepository.findUserByUsername(username);

    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    // A deleted account looks the same as one that never existed.
    if (!user || user.status === UserStatus.deleted) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Same response whether or not this attempt locked the account, so the lock isn't revealed.
    if (!passwordMatches) {
      await userSecurityService.recordFailedLogin(user, client);
      await authRepository.createLoginEvent({
        userId: user.id,
        portal,
        status: LoginStatus.failed,
        blockReason: LOGIN_BLOCK_REASONS.wrongPassword,
        ...toLoginEventData(null, client),
      });
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Only told after the correct password, so a locked account can't be discovered by guessing.
    if (user.security?.lockedAt) {
      await authRepository.createLoginEvent({
        userId: user.id,
        portal,
        status: LoginStatus.blocked,
        blockReason: LOGIN_BLOCK_REASONS.accountLocked,
        ...toLoginEventData(null, client),
      });
      throw ApiError.forbidden('Your account is locked. Please contact your administrator.', ERROR_CODES.ACCOUNT_LOCKED);
    }

    // Same message as a wrong password, so other portals' accounts aren't revealed.
    if (ROLE_PORTAL[user.role] !== portal) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!userService.isActive(user)) {
      throw ApiError.forbidden('Your account is not active. Please contact your admin.', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    const lookup = await fingerprintService.getEvent(eventId).then(
      (event) => ({ event, failed: false }),
      (err) => {
        logger.warn('Fingerprint lookup failed:', err);
        return { event: null, failed: true };
      },
    );

    // Checked before any login writes, so a blocked login doesn't burn the temp password.
    const block = checkLoginRisk(lookup);
    if (block) {
      await guardEventReuse(() =>
        authRepository.createLoginEvent({
          userId: user.id,
          portal,
          status: LoginStatus.blocked,
          blockReason: block.reason,
          ...toLoginEventData(lookup.event, client),
        }),
      );
      throw ApiError.forbidden(block.message, ERROR_CODES.LOGIN_BLOCKED);
    }

    // The temporary password works for one login only.
    if (user.mustChangePassword && user.tempPasswordUsedAt) {
      throw ApiError.forbidden(TEMP_PASSWORD_USED, ERROR_CODES.TEMP_PASSWORD_USED);
    }

    // All login writes succeed or fail together, so a rejected login never burns the temp password.
    const session = await guardEventReuse(() =>
      withTransaction(async (tx) => {
        // Only marks it if still unused, so two parallel logins can't both use the same temp password.
        if (user.mustChangePassword && (await authRepository.markTempPasswordUsed(user.id, tx)).count === 0) {
          throw ApiError.forbidden(TEMP_PASSWORD_USED, ERROR_CODES.TEMP_PASSWORD_USED);
        }

        await authRepository.updateLastLogin(user.id, tx);

        if (user.security?.failedLoginAttempts) {
          await userSecurityService.resetAttempts(user.id, tx);
        }

        const created = await authRepository.createSession(
          {
            userId: user.id,
            portal,
            ...client,
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

    return {
      mustChangePassword: user.mustChangePassword,
      ...(await issueTokens(user, session)),
      user: {
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
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
      session.revokedAt ||
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
