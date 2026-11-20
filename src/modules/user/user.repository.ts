import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import { UserStatus, Role } from '../../generated/prisma/enums.js';

export const userRepository = {
  isUsernameTaken: async (username: string, tx: TxClient = prisma) =>
    (await tx.user.findUnique({ where: { username }, select: { id: true } })) !== null,

  isEmailTaken: async (email: string, tx: TxClient = prisma) =>
    (await tx.user.findUnique({ where: { email }, select: { id: true } })) !== null,

  isMobileTaken: async (countryCode: string, mobileNumber: string, tx: TxClient = prisma) =>
    (await tx.user.findUnique({
      where: { countryCode_mobileNumber: { countryCode, mobileNumber } },
      select: { id: true },
    })) !== null,

  findIdsByRole: async (role: Role, tx: TxClient = prisma) =>
    (await tx.user.findMany({ where: { role, status: UserStatus.active }, select: { id: true } })).map(({ id }) => id),

  findAccount: (id: number, tx: TxClient = prisma) =>
    tx.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        parentId: true,
        username: true,
        email: true,
        countryCode: true,
        mobileNumber: true,
        parent: { select: { status: true } },
      },
    }),

  updateAccount: (
    id: number,
    data: { username?: string; email?: string; countryCode?: string; mobileNumber?: string },
    tx: TxClient = prisma,
  ) => tx.user.update({ where: { id }, data, select: { id: true } }),

  findByUuid: (uuid: string) =>
    prisma.user.findUnique({ where: { uuid }, select: { id: true, role: true, status: true, parentId: true } }),

  findUsername: async (id: number) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { username: true } })).username,

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
      select: {
        id: true,
        uuid: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        firstName: true,
        lastName: true,
        email: true,
        countryCode: true,
        mobileNumber: true,
        security: { select: { failedLoginAttempts: true, lockedAt: true } },
      },
    }),

  updateStatus: (id: number, status: UserStatus, tx: TxClient) =>
    tx.user.update({
      where: { id },
      data: { status, deletedAt: status === UserStatus.deleted ? new Date() : undefined },
    }),

  // An update holds the row lock until the transaction ends.
  lockById: (id: number, tx: TxClient) => tx.user.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } }),

  findChildren: (parentId: number, tx: TxClient) =>
    tx.user.findMany({ where: { parentId, status: { not: UserStatus.deleted } }, select: { id: true, status: true, uuid: true, username: true, firstName: true, lastName: true, email: true, createdAt: true, updatedAt: true } }),

  countChildren: (parentId: number, tx: TxClient = prisma) =>
    tx.user.count({ where: { parentId, status: { not: UserStatus.deleted } } }),

  countAgentsByParent: (parentId: number, tx: TxClient = prisma) =>
  tx.user.count({
    where: { parentId, role: Role.agent, status: { not: UserStatus.deleted } },
  }),

  findAgentsByParent: (parentId: number, page: number, pageSize: number,tx: TxClient = prisma) =>
  tx.user.findMany({
    where: {
      parentId,
      role: Role.agent,
      status: { not: UserStatus.deleted },
    },
    select: {
      id: true,
      uuid: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
};
