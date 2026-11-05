import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LoginStatus } from '../../generated/prisma/enums.js';

const ALERT_SELECT = {
  id: true,
  type: true,
  metadata: true,
  createdAt: true,
  resolvedAt: true,
  user: { select: { uuid: true, username: true, role: true } },
  resolvedBy: { select: { username: true } },
  loginEvent: {
    select: {
      createdAt: true,
      requestIp: true,
      visitorId: true,
      browserName: true,
      os: true,
      city: true,
      countryCode: true,
      latitude: true,
      longitude: true,
    },
  },
} satisfies Prisma.SecurityAlertSelect;

export const securityAlertRepository = {
  createMany: (data: Prisma.SecurityAlertCreateManyInput[], tx: TxClient = prisma) =>
    tx.securityAlert.createMany({ data }),

  findPage: (where: Prisma.SecurityAlertWhereInput, page: number, pageSize: number) =>
    prisma.securityAlert.findMany({
      where,
      select: ALERT_SELECT,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),

  count: (where: Prisma.SecurityAlertWhereInput) => prisma.securityAlert.count({ where }),

  findOne: (where: Prisma.SecurityAlertWhereInput) =>
    prisma.securityAlert.findFirst({ where, select: { id: true, userId: true } }),

  // Only resolves an open alert; count is 0 if it was already resolved.
  resolve: (id: number, resolvedById: number) =>
    prisma.securityAlert.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById } }),

  findLastSuccessfulLogin: (userId: number, tx: TxClient) =>
    tx.loginEvent.findFirst({
      where: { userId, status: LoginStatus.success },
      orderBy: { id: 'desc' },
      select: { city: true, countryCode: true, latitude: true, longitude: true, createdAt: true },
    }),

  hasLoggedInFromDevice: async (userId: number, visitorId: string, tx: TxClient) =>
    (await tx.loginEvent.findFirst({
      where: { userId, visitorId, status: LoginStatus.success },
      select: { id: true },
    })) !== null,

  hasLoggedInFromPlace: async (userId: number, countryCode: string, city: string | null, tx: TxClient) =>
    (await tx.loginEvent.findFirst({
      where: { userId, countryCode, city, status: LoginStatus.success },
      select: { id: true },
    })) !== null,

  countFailedLoginsSince: (userId: number, since: Date) =>
    prisma.loginEvent.count({ where: { userId, status: LoginStatus.failed, createdAt: { gte: since } } }),
};
