import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';

export const userSecurityRepository = {
  saveFailedAttempt: (userId: number, failedLoginAttempts: number, lock: boolean) => {
    const data = { failedLoginAttempts, lastFailedLoginAt: new Date(), lockedAt: lock ? new Date() : undefined };
    return prisma.userSecurity.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  },

  resetAttempts: (userId: number, tx: TxClient) =>
    tx.userSecurity.updateMany({ where: { userId }, data: { failedLoginAttempts: 0, lastFailedLoginAt: null } }),

  // Only unlocks a locked account; count is 0 if it wasn't locked.
  unlock: (userId: number) =>
    prisma.userSecurity.updateMany({
      where: { userId, lockedAt: { not: null } },
      data: { failedLoginAttempts: 0, lastFailedLoginAt: null, lockedAt: null },
    }),
};
