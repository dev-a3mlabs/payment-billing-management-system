import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { ApiError } from '../../utils/ApiError.js';
import { authRepository } from '../auth/auth.repository.js';
import { SESSION_IDLE_MS, sessionRepository } from './session.repository.js';

const NO_DEVICE_DETAILS = { browserName: null, os: null, city: null, countryCode: null };

export const sessionService = {
  isActive: (session: { revokedAt: Date | null; expiresAt: Date; lastActiveAt: Date }) =>
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    Date.now() - session.lastActiveAt.getTime() < SESSION_IDLE_MS,

  list: async (userId: number, currentSessionId?: number) =>
    (await sessionRepository.findActive(userId)).map(({ id, loginEvents, ...session }) => ({
      ...session,
      ...(loginEvents[0] ?? NO_DEVICE_DETAILS),
      isCurrent: id === currentSessionId,
    })),

  revokeOne: async (userId: number, uuid: string) => {
    const { count } = await sessionRepository.revokeOne(userId, uuid, SESSION_REVOKE_REASONS.revokedByUser);
    if (count === 0) {
      throw ApiError.notFound('Session not found');
    }
  },

  revokeAll: (userId: number) => authRepository.revokeAllSessions(userId, SESSION_REVOKE_REASONS.revokedByAdmin),

  // Adds activeDevices to each user and drops the internal id, using one query for the whole list.
  withActiveDevices: async <T extends { id: number }>(users: T[]) => {
    const counts = await sessionRepository.countActiveByUser({ userId: { in: users.map((user) => user.id) } });
    const byUser = new Map(counts.map((row) => [row.userId, row._count._all]));

    return users.map(({ id, ...user }) => ({ ...user, activeDevices: byUser.get(id) ?? 0 }));
  },
};
