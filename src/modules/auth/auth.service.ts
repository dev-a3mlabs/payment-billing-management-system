import bcrypt from 'bcrypt';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { ROLE_PORTAL, type Portal } from '../../config/portals.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { Prisma, type User, type UserSession } from '../../generated/prisma/client.js';
import { ActivityStatus, LoginStatus, UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/token.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { authRepository } from './auth.repository.js';
import { toLoginEventData } from './login-event.js';
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

export const authService = {
  login: async ({ username, password, eventId }: LoginInput, portal: Portal, client: ClientInfo) => {
    const user = await authRepository.findUserByUsername(username);

    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Same message as a wrong password, so other portals' accounts aren't revealed.
    if (ROLE_PORTAL[user.role] !== portal) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.active) {
      throw ApiError.forbidden('Your account is not active. Please contact your admin.', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    // A Fingerprint failure must not block the login; the login event is saved without its fields.
    const fingerprintEvent = await fingerprintService.getEvent(eventId).catch((err) => {
      logger.warn('Fingerprint lookup failed:', err);
      return null;
    });

    if (!fingerprintEvent) {
      logger.warn(`Fingerprint event not found for user ${user.id} (eventId: ${eventId})`);
    }

    // The temporary password works for one login only.
    if (user.mustChangePassword && user.tempPasswordUsedAt) {
      throw ApiError.forbidden(TEMP_PASSWORD_USED, ERROR_CODES.TEMP_PASSWORD_USED);
    }

    // All login writes succeed or fail together, so a rejected login never burns the temp password.
    let session: UserSession;
    try {
      session = await withTransaction(async (tx) => {
        // Only marks it if still unused, so two parallel logins can't both use the same temp password.
        if (user.mustChangePassword && (await authRepository.markTempPasswordUsed(user.id, tx)).count === 0) {
          throw ApiError.forbidden(TEMP_PASSWORD_USED, ERROR_CODES.TEMP_PASSWORD_USED);
        }

        await authRepository.updateLastLogin(user.id, tx);

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
            ...toLoginEventData(fingerprintEvent, client),
          },
          tx,
        );

        return created;
      });
    } catch (err) {
      // event_id is the only unique column a login can collide on, so this is a replayed event.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.unauthorized('Device verification failed. Please try again.', ERROR_CODES.FINGERPRINT_EVENT_REUSED);
      }
      throw err;
    }

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
      user.status !== UserStatus.active ||
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
