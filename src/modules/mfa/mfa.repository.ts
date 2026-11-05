import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';

export const mfaRepository = {
  findByUserId: (userId: number) => prisma.userMfa.findUnique({ where: { userId } }),

  savePendingSecret: (userId: number, secretEncrypted: string) =>
    prisma.userMfa.upsert({
      where: { userId },
      create: { userId, secretEncrypted },
      update: { secretEncrypted, enabledAt: null, lastUsedStep: null },
    }),

  enable: async (userId: number, step: number, codeHashes: string[], tx: TxClient) => {
    await tx.userMfa.update({ where: { userId }, data: { enabledAt: new Date(), lastUsedStep: step } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: codeHashes.map((codeHash) => ({ userId, codeHash })) });
  },

  // Only accepts a step newer than the last one, so the same code can't be used twice; count is 0 otherwise.
  useStep: (userId: number, step: number) =>
    prisma.userMfa.updateMany({
      where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    }),

  // Only uses a code that is still unused; count is 0 otherwise.
  useRecoveryCode: (userId: number, codeHash: string) =>
    prisma.mfaRecoveryCode.updateMany({ where: { userId, codeHash, usedAt: null }, data: { usedAt: new Date() } }),

  // Returns how many MFA setups were removed (0 or 1).
  remove: async (userId: number, tx: TxClient) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaChallenge.deleteMany({ where: { userId } });
    return (await tx.userMfa.deleteMany({ where: { userId } })).count;
  },

  createChallenge: (data: { userId: number; tokenHash: string; portal: string; visitorId?: string; expiresAt: Date }) =>
    prisma.mfaChallenge.create({ data }),

  findChallenge: (tokenHash: string) => prisma.mfaChallenge.findUnique({ where: { tokenHash } }),

  addChallengeAttempt: (id: number) =>
    prisma.mfaChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } }),

  // Only closes a challenge that is still open; count is 0 if it was already used.
  closeChallenge: (id: number) =>
    prisma.mfaChallenge.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } }),
};
