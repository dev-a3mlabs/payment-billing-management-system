import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import { SESSION_REVOKE_REASONS, type SessionRevokeReason } from '../../config/session-revoke-reasons.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const authRepository = {
  findUserByUsername: (username: string) =>
    prisma.user.findUnique({
      where: { username },
      include: { parent: { select: { status: true } }, security: true },
    }),

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

  // Only marks a temp password that is still unused; count is 0 if it was already used.
  markTempPasswordUsed: (userId: number, tx: TxClient = prisma) =>
    tx.user.updateMany({ where: { id: userId, tempPasswordUsedAt: null }, data: { tempPasswordUsedAt: new Date() } }),

  updateLastLogin: (userId: number, tx: TxClient = prisma) =>
    tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),

  createSession: (
    data: {
      userId: number;
      portal: string;
      ipAddress?: string;
      userAgent?: string;
      expiresAt: Date;
    },
    tx: TxClient = prisma,
  ) => tx.userSession.create({ data }),

  createLoginEvent: (data: Prisma.LoginEventUncheckedCreateInput, tx: TxClient = prisma) =>
    tx.loginEvent.create({ data }),

  findSessionByUuid: (uuid: string) =>
    prisma.userSession.findUnique({
      where: { uuid },
      include: { user: { include: { parent: { select: { status: true } } } } },
    }),

  touchSession: (sessionId: number) =>
    prisma.userSession.update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } }),

  revokeSession: (sessionId: number, reason: SessionRevokeReason) =>
    prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),

  revokeAllSessions: (userId: number, reason: SessionRevokeReason, tx: TxClient = prisma) =>
    tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),

  createRefreshToken: (data: { sessionId: number; tokenHash: string; expiresAt: Date }) =>
    prisma.refreshToken.create({ data }),

  findRefreshToken: (tokenHash: string) =>
    prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: { include: { user: { include: { parent: { select: { status: true } } } } } } },
    }),

  // Only revokes a token that is still active; count is 0 if it was already revoked.
  revokeRefreshToken: (id: number) =>
    prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),
};
