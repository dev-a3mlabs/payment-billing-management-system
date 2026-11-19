import type { SessionRevokeReason } from '../../config/session-revoke-reasons.js';
import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';

// A session unused for this long no longer counts as logged in.
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

const activeWhere = () => ({
  revokedAt: null,
  expiresAt: { gt: new Date() },
  lastActiveAt: { gt: new Date(Date.now() - SESSION_IDLE_MS) },
});

export const sessionRepository = {
  findActive: (userId: number) =>
    prisma.userSession.findMany({
      where: { userId, ...activeWhere() },
      select: {
        id: true,
        uuid: true,
        portal: true,
        ipAddress: true,
        createdAt: true,
        lastActiveAt: true,
        loginEvents: {
          select: {
            browserName: true,
            browserVersion: true,
            os: true,
            osVersion: true,
            deviceType: true,
            deviceBrand: true,
            deviceModel: true,
            city: true,
            countryCode: true,
          },
          take: 1,
        },
      },
      orderBy: { lastActiveAt: 'desc' },
    }),

  findActiveVisitorIds: async (userId: number, tx: TxClient) =>
    (
      await tx.userSession.findMany({
        where: { userId, visitorId: { not: null }, ...activeWhere() },
        distinct: ['visitorId'],
        select: { visitorId: true },
      })
    ).map((session) => session.visitorId),

  revokeDevice: (userId: number, visitorId: string, reason: SessionRevokeReason, tx: TxClient) =>
    tx.userSession.updateMany({
      where: { userId, visitorId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),

  // One row per user with their number of logged-in devices.
  countActiveByUser: (where: Prisma.UserSessionWhereInput) =>
    prisma.userSession.groupBy({ by: ['userId'], where: { AND: [where, activeWhere()] }, _count: { _all: true } }),

  revokeOne: (userId: number, uuid: string, reason: SessionRevokeReason, tx: TxClient) =>
    tx.userSession.updateMany({
      where: { userId, uuid, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),
};
