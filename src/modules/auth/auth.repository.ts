import { prisma } from '../../db/prisma.js';

export const authRepository = {
  findUserByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),

  markTempPasswordUsed: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { tempPasswordUsedAt: new Date() } }),

  updateLastLogin: (userId: number) =>
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
};
