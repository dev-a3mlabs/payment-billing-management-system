import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ChangeRequestStatus } from '../../generated/prisma/enums.js';

const REQUEST_SELECT = {
  id: true,
  userId: true,
  uuid: true,
  field: true,
  oldValue: true,
  newValue: true,
  status: true,
  rejectReason: true,
  expiresAt: true,
  decidedAt: true,
  createdAt: true,
  user: { select: { uuid: true, username: true, role: true, parent: { select: { status: true } } } },
  decidedBy: { select: { username: true } },
} satisfies Prisma.ChangeRequestSelect;

const pendingWhere = () => ({ status: ChangeRequestStatus.pending, expiresAt: { gt: new Date() } });

export const changeRequestRepository = {
  create: (data: Prisma.ChangeRequestUncheckedCreateInput, tx: TxClient) =>
    tx.changeRequest.create({ data, select: REQUEST_SELECT }),

  findPage: (where: Prisma.ChangeRequestWhereInput, page: number, pageSize: number) =>
    prisma.changeRequest.findMany({
      where,
      select: REQUEST_SELECT,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),

  count: (where: Prisma.ChangeRequestWhereInput) => prisma.changeRequest.count({ where }),

  findOne: (where: Prisma.ChangeRequestWhereInput, tx: TxClient = prisma) =>
    tx.changeRequest.findFirst({ where, select: REQUEST_SELECT }),

  countSince: (userId: number, since: Date, tx: TxClient) =>
    tx.changeRequest.count({ where: { userId, createdAt: { gt: since } } }),

  hasPending: async (userId: number, field: string, tx: TxClient) =>
    (await tx.changeRequest.findFirst({ where: { userId, field, ...pendingWhere() }, select: { id: true } })) !== null,

  // Only decides a request that is still pending; count is 0 otherwise.
  decide: (
    id: number,
    data: { status: ChangeRequestStatus; decidedById?: number; rejectReason?: string },
    tx: TxClient,
  ) => tx.changeRequest.updateMany({ where: { id, ...pendingWhere() }, data: { ...data, decidedAt: new Date() } }),

  pendingWhere,
};
