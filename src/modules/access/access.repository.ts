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

  upsertUserValue: async (
    userId: number,
    key: string,
    value: string,
    locked: boolean,
    updatedById: number,
    tx: TxClient,
  ) => {
    const { id: accessKeyId } = await tx.accessKey.findUniqueOrThrow({ where: { key }, select: { id: true } });

    return tx.accessUserValue.upsert({
      where: { userId_accessKeyId: { userId, accessKeyId } },
      update: { value, locked, updatedById },
      create: { userId, accessKeyId, value, locked, updatedById },
    });
  },

  deleteUserValue: (userId: number, key: string) =>
    prisma.accessUserValue.deleteMany({ where: { userId, accessKey: { key } } }),

  unlockUserValue: (userId: number, key: string) =>
    prisma.accessUserValue.updateMany({ where: { userId, accessKey: { key }, locked: true }, data: { locked: false } }),

  findGrantedKeys: async (userId: number) => {
    const grants = await prisma.accessGrant.findMany({ where: { userId }, select: { accessKey: { select: { key: true } } } });
    return grants.map((grant) => grant.accessKey.key);
  },

  replaceGrants: async (userId: number, keys: string[], grantedById: number, tx: TxClient) => {
    await tx.accessGrant.deleteMany({ where: { userId, accessKey: { key: { notIn: keys } } } });

    const accessKeys = await tx.accessKey.findMany({ where: { key: { in: keys } }, select: { id: true } });
    await tx.accessGrant.createMany({
      data: accessKeys.map(({ id }) => ({ userId, accessKeyId: id, grantedById })),
      skipDuplicates: true,
    });
  },
};
