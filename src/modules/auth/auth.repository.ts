import { prisma } from '../../db/prisma.js';
import { SESSION_REVOKE_REASONS, type SessionRevokeReason } from '../../config/session-revoke-reasons.js';

export const authRepository = {
  findUserByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),

  findPasswordHash: async (userId: number) =>
    (await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }))?.passwordHash,

  // Saves the new password and logs out every other device in one transaction.
  updatePassword: async (userId: number, passwordHash: string, currentSessionId: number) => {
    const now = new Date();

    const [, revoked] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false, tempPasswordUsedAt: null, passwordChangedAt: now },
      }),
      prisma.userSession.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: now, revokeReason: SESSION_REVOKE_REASONS.passwordChanged },
      }),
    ]);
    return revoked.count;
  },

  markTempPasswordUsed: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { tempPasswordUsedAt: new Date() } }),

  updateLastLogin: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),

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
