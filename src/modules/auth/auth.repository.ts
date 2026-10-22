import { prisma } from '../../db/prisma.js';
import type { SessionRevokeReason } from '../../config/session-revoke-reasons.js';

export const authRepository = {
  findUserByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),

  markTempPasswordUsed: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { tempPasswordUsedAt: new Date() } }),

  updateLastLogin: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),

  countActiveSessions: (userId: number) =>
    prisma.userSession.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } }),

  createSession: (data: {
    userId: number;
    portal: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }) => prisma.userSession.create({ data }),

  findSessionByUuid: (uuid: string) =>
    prisma.userSession.findUnique({ where: { uuid }, include: { user: true } }),

  touchSession: (sessionId: number) =>
    prisma.userSession.update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } }),

  revokeSession: (sessionId: number, reason: SessionRevokeReason) =>
    prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),

  revokeAllSessions: (userId: number, reason: SessionRevokeReason) =>
    prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),

  createRefreshToken: (data: { sessionId: number; tokenHash: string; expiresAt: Date }) =>
    prisma.refreshToken.create({ data }),

  findRefreshToken: (tokenHash: string) =>
    prisma.refreshToken.findUnique({ where: { tokenHash }, include: { session: { include: { user: true } } } }),

  // Only revokes a token that is still active; count is 0 if it was already revoked.
  revokeRefreshToken: (id: number) =>
    prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),
};
