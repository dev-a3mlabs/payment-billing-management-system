import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  type: true,
  entityId: true,
  metadata: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export const notificationRepository = {
  create: (data: Prisma.NotificationUncheckedCreateInput, tx: TxClient) =>
    tx.notification.create({ data, select: NOTIFICATION_SELECT }),

  findPage: (userId: number, page: number, pageSize: number) =>
    prisma.notification.findMany({
      where: { userId },
      select: NOTIFICATION_SELECT,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),

  findAfter: (userId: number, afterId: number, limit: number) =>
    prisma.notification.findMany({
      where: { userId, id: { gt: afterId } },
      select: NOTIFICATION_SELECT,
      orderBy: { id: 'asc' },
      take: limit,
    }),

  count: (where: Prisma.NotificationWhereInput) => prisma.notification.count({ where }),

  exists: async (userId: number, id: number) =>
    (await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } })) !== null,

  markRead: (where: Prisma.NotificationWhereInput) =>
    prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } }),
};
