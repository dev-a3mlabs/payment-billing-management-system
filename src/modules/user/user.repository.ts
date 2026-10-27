import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import { UserStatus, type Role } from '../../generated/prisma/enums.js';

export const userRepository = {
  isUsernameTaken: async (username: string, tx: TxClient = prisma) =>
    (await tx.user.findUnique({ where: { username }, select: { id: true } })) !== null,

  findByUuid: (uuid: string) =>
    prisma.user.findUnique({ where: { uuid }, select: { id: true, role: true, status: true, parentId: true } }),

  create: (
    data: { username: string; passwordHash: string; role: Role; createdById: number; parentId?: number },
    tx: TxClient = prisma,
  ) =>
    tx.user.create({
      data: { ...data, mustChangePassword: true },
      select: { uuid: true, username: true, role: true, mustChangePassword: true, createdAt: true },
    }),

  findAllByRole: (role: Role) =>
    prisma.user.findMany({
      where: { role, status: { not: UserStatus.deleted } },
      select: { uuid: true, username: true, role: true, status: true, createdAt: true, firstName: true, lastName: true, email: true },
    }),

  updateStatus: (id: number, status: UserStatus, tx: TxClient) =>
    tx.user.update({
      where: { id },
      data: { status, deletedAt: status === UserStatus.deleted ? new Date() : undefined },
    }),

  // An update holds the row lock until the transaction ends.
  lockById: (id: number, tx: TxClient) => tx.user.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } }),

  countChildren: (parentId: number, tx: TxClient = prisma) =>
    tx.user.count({ where: { parentId, status: { not: UserStatus.deleted } } }),
};
