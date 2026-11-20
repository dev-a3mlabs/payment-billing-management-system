import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { SESSION_REVOKE_REASONS, type SessionRevokeReason } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { ActivityStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { userService } from '../user/user.service.js';
import { SESSION_IDLE_MS, sessionRepository } from './session.repository.js';

const ACTIVITY_SAVE_INTERVAL_MS = 60 * 1000;

const NO_DEVICE_DETAILS = {
  browserName: null,
  browserVersion: null,
  os: null,
  osVersion: null,
  deviceType: null,
  deviceBrand: null,
  deviceModel: null,
  city: null,
  countryCode: null,
};

export const sessionService = {
  isActive: (session: { revokedAt: Date | null; expiresAt: Date; lastActiveAt: Date }) =>
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    Date.now() - session.lastActiveAt.getTime() < SESSION_IDLE_MS,

  // For long-lived requests (notification streams) that must stop when the session ends.
  isStillValid: async (sessionId: number) => {
    const session = await sessionRepository.findWithUser(sessionId);
    return session !== null && sessionService.isActive(session) && userService.isActive(session.user);
  },

  // Saves at most once a minute, so most requests don't write to the DB.
  markActive: async (session: { id: number; lastActiveAt: Date }) => {
    if (Date.now() - session.lastActiveAt.getTime() >= ACTIVITY_SAVE_INTERVAL_MS) {
      await authRepository.touchSession(session.id);
    }
  },

  list: async (userId: number, currentSessionId?: number) =>
    (await sessionRepository.findActive(userId)).map(({ id, loginEvents, ...session }) => ({
      ...session,
      ...(loginEvents[0] ?? NO_DEVICE_DETAILS),
      isCurrent: id === currentSessionId,
    })),

  revokeOne: (userId: number, uuid: string, reason: SessionRevokeReason, actor: AuthUser, client: ClientInfo) =>
    withTransaction(async (tx) => {
      const { count } = await sessionRepository.revokeOne(userId, uuid, reason, tx);
      if (count === 0) {
        throw ApiError.notFound('Session not found');
      }

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.sessionRevoke,
          status: ActivityStatus.success,
          actorId: actor.id,
          targetUserId: userId,
          sessionId: actor.sessionId,
          metadata: { sessionUuid: uuid, reason },
        },
        client,
        tx,
      );
    }),

  revokeAll: (userId: number, actor: AuthUser, client: ClientInfo) =>
    withTransaction(async (tx) => {
      const reason = SESSION_REVOKE_REASONS.revokedByAdmin;
      const { count } = await authRepository.revokeAllSessions(userId, reason, tx);
      if (count === 0) return;

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.sessionRevokeAll,
          status: ActivityStatus.success,
          actorId: actor.id,
          targetUserId: userId,
          sessionId: actor.sessionId,
          metadata: { count, reason },
        },
        client,
        tx,
      );
    }),

  // Adds activeDevices to each user and drops the internal id, using one query for the whole list.
  withActiveDevices: async <T extends { id: number }>(users: T[]) => {
    const counts = await sessionRepository.countActiveByUser({ userId: { in: users.map((user) => user.id) } });
    const byUser = new Map(counts.map((row) => [row.userId, row._count._all]));

    return users.map(({ id, ...user }) => ({ ...user, activeDevices: byUser.get(id) ?? 0 }));
  },
};
