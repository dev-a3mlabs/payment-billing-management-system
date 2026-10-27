import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Role } from '../../generated/prisma/enums.js';

export const accessRepository = {
  findKeyWithValues: (key: string, userId: number, role: Role) =>
    prisma.accessKey.findUnique({
      where: { key },
      include: {
        userValues: { where: { userId } },
        roleValues: { where: { role } },
      },
    }),

  findKeysWithValues: (keys: string[], userId: number, role: Role) =>
    prisma.accessKey.findMany({
      where: { key: { in: keys } },
      include: {
        userValues: { where: { userId } },
        roleValues: { where: { role } },
      },
    }),

  upsertUserValue: async (userId: number, key: string, value: string, updatedById: number, tx: TxClient) => {
    const { id: accessKeyId } = await tx.accessKey.findUniqueOrThrow({ where: { key }, select: { id: true } });

    return tx.accessUserValue.upsert({
      where: { userId_accessKeyId: { userId, accessKeyId } },
      update: { value, updatedById },
      create: { userId, accessKeyId, value, updatedById },
    });
  },

  deleteUserValue: (userId: number, key: string) =>
    prisma.accessUserValue.deleteMany({ where: { userId, accessKey: { key } } }),
};
