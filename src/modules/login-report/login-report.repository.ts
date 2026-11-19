import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LoginStatus } from '../../generated/prisma/enums.js';

// ipInfo is large raw Fingerprint JSON, so reports never load it.
const REPORT_SELECT = {
  id: true,
  createdAt: true,
  portal: true,
  status: true,
  blockReason: true,
  mfaMethod: true,
  attemptedUsername: true,
  requestIp: true,
  visitorId: true,
  browserName: true,
  browserVersion: true,
  os: true,
  osVersion: true,
  deviceType: true,
  deviceBrand: true,
  deviceModel: true,
  userAgent: true,
  city: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  isNewDevice: true,
  isNewLocation: true,
  isImpossibleTravel: true,
  user: { select: { uuid: true, username: true, role: true } },
  session: { select: { revokedAt: true, expiresAt: true, lastActiveAt: true } },
} satisfies Prisma.LoginEventSelect;

export const loginReportRepository = {
  findPage: (where: Prisma.LoginEventWhereInput, page: number, pageSize: number) =>
    prisma.loginEvent.findMany({
      where,
      select: REPORT_SELECT,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),

  // Keyset pagination: each batch starts below the last id, so large exports stay fast.
  findBatch: (where: Prisma.LoginEventWhereInput, beforeId: bigint | undefined, take: number) =>
    prisma.loginEvent.findMany({
      where: beforeId === undefined ? where : { AND: [where, { id: { lt: beforeId } }] },
      select: REPORT_SELECT,
      orderBy: { id: 'desc' },
      take,
    }),

  count: (where: Prisma.LoginEventWhereInput) => prisma.loginEvent.count({ where }),

  countByStatus: (where: Prisma.LoginEventWhereInput) =>
    prisma.loginEvent.groupBy({ by: ['status'], where, _count: { _all: true } }),

  countByReason: (where: Prisma.LoginEventWhereInput) =>
    prisma.loginEvent.groupBy({
      by: ['blockReason'],
      where: { AND: [where, { blockReason: { not: null } }] },
      _count: { _all: true },
    }),

  countByCountry: (where: Prisma.LoginEventWhereInput, take: number) =>
    prisma.loginEvent.groupBy({
      by: ['countryCode'],
      where: { AND: [where, { status: LoginStatus.success }, { countryCode: { not: null } }] },
      _count: { _all: true },
      orderBy: { _count: { countryCode: 'desc' } },
      take,
    }),

  countUniqueUsers: async (where: Prisma.LoginEventWhereInput) =>
    (
      await prisma.loginEvent.groupBy({
        by: ['userId'],
        where: { AND: [where, { status: LoginStatus.success }, { userId: { not: null } }] },
      })
    ).length,

  countUniqueDevices: async (where: Prisma.LoginEventWhereInput) =>
    (await prisma.loginEvent.groupBy({ by: ['visitorId'], where: { AND: [where, { visitorId: { not: null } }] } }))
      .length,
};
