import { prisma } from '../../db/prisma.js';

export const authRepository = {
  findUserByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),

  findUserByUuid: (uuid: string) => prisma.user.findUnique({ where: { uuid } }),

  markTempPasswordUsed: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { tempPasswordUsedAt: new Date() } }),

  updateLastLogin: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),

  createRefreshToken: (data: { userId: number; tokenHash: string; expiresAt: Date }) =>
    prisma.refreshToken.create({ data }),

  findRefreshToken: (tokenHash: string) =>
    prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }),

  // Only revokes a token that is still active; count is 0 if it was already revoked.
  revokeRefreshToken: (where: { id: number } | { tokenHash: string }) =>
    prisma.refreshToken.updateMany({ where: { ...where, revokedAt: null }, data: { revokedAt: new Date() } }),

  revokeAllRefreshTokens: (userId: number) =>
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
};
