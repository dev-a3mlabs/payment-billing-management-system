import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, LoginStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { decimalToNumber } from '../../utils/decimal.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { sessionRepository } from '../session/session.repository.js';
import { sessionService } from '../session/session.service.js';
import { loginReportRepository } from './login-report.repository.js';
import { scopeWhere, type ReportScope } from './report-scope.js';
import type { LoginReportQuery } from './v1/login-report.schema.js';

const PAGE_SIZE = 20;
const DEFAULT_RANGE_DAYS = 30;
const EXPORT_BATCH_SIZE = 1000;
const TOP_COUNTRIES = 10;

type ReportFilters = Partial<Omit<LoginReportQuery, 'page'>>;
type ReportEvent = Awaited<ReturnType<typeof loginReportRepository.findPage>>[number];

const dateRange = ({ from, to }: ReportFilters) => {
  const end = to ?? new Date();
  return { from: from ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: end };
};

const buildWhere = (scope: ReportScope, filters: ReportFilters): Prisma.LoginEventWhereInput => {
  const { from, to } = dateRange(filters);
  const conditions: Prisma.LoginEventWhereInput[] = [
    // Unknown usernames belong to no admin, so only the super admin sees them, and only without a user filter.
    scope.kind === 'managed' && !filters.userUuid && !filters.role
      ? { OR: [{ userId: null }, scopeWhere(scope)] }
      : scopeWhere(scope),
    { createdAt: { gte: from, lte: to } },
  ];

  if (filters.userUuid) conditions.push({ user: { is: { uuid: filters.userUuid } } });
  if (filters.role) conditions.push({ user: { is: { role: filters.role } } });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.countryCode) conditions.push({ countryCode: filters.countryCode });
  if (filters.ip) conditions.push({ requestIp: filters.ip });
  if (filters.visitorId) conditions.push({ visitorId: filters.visitorId });
  if (filters.flagged) {
    conditions.push({ OR: [{ isNewDevice: true }, { isNewLocation: true }, { isImpossibleTravel: true }] });
  }

  return { AND: conditions };
};

const toRow = ({ id, latitude, longitude, session, ...event }: ReportEvent) => ({
  id: id.toString(),
  ...event,
  latitude: decimalToNumber(latitude),
  longitude: decimalToNumber(longitude),
  sessionActive: session ? sessionService.isActive(session) : false,
});

const CSV_COLUMNS = [
  'Time',
  'Username',
  'Role',
  'Portal',
  'Status',
  'Reason',
  'MFA method',
  'IP',
  'Visitor ID',
  'Browser',
  'OS',
  'City',
  'Country',
  'Latitude',
  'Longitude',
  'New device',
  'New location',
  'Impossible travel',
  'Still logged in',
  'User agent',
];

// Quotes every cell, and stops spreadsheet apps from running text that starts like a formula.
const csvCell = (value: string | number | boolean | Date | null | undefined) => {
  if (value === null || value === undefined) return '""';
  const text = value instanceof Date ? value.toISOString() : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const toCsvLine = (row: ReturnType<typeof toRow>) =>
  [
    row.createdAt,
    row.user?.username ?? row.attemptedUsername,
    row.user?.role,
    row.portal,
    row.status,
    row.blockReason,
    row.mfaMethod,
    row.requestIp,
    row.visitorId,
    row.browserName,
    row.os,
    row.city,
    row.countryCode,
    row.latitude,
    row.longitude,
    row.isNewDevice,
    row.isNewLocation,
    row.isImpossibleTravel,
    row.sessionActive,
    row.userAgent,
  ]
    .map(csvCell)
    .join(',') + '\r\n';

export const loginReportService = {
  list: async (scope: ReportScope, { page, ...filters }: { page: number } & ReportFilters) => {
    const where = buildWhere(scope, filters);
    const [events, total] = await Promise.all([
      loginReportRepository.findPage(where, page, PAGE_SIZE),
      loginReportRepository.count(where),
    ]);
    const rows = events.map(toRow);

    return {
      ...dateRange(filters),
      // A user's own history doesn't repeat who they are on every row.
      items: scope.kind === 'self' ? rows.map(({ user, attemptedUsername, ...row }) => row) : rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    };
  },

  summary: async (scope: ReportScope, filters: ReportFilters) => {
    const where = buildWhere(scope, filters);
    const [byStatus, byReason, byCountry, uniqueUsers, uniqueDevices, newDevice, newLocation, impossibleTravel, active] =
      await Promise.all([
        loginReportRepository.countByStatus(where),
        loginReportRepository.countByReason(where),
        loginReportRepository.countByCountry(where, TOP_COUNTRIES),
        loginReportRepository.countUniqueUsers(where),
        loginReportRepository.countUniqueDevices(where),
        loginReportRepository.count({ AND: [where, { isNewDevice: true }] }),
        loginReportRepository.count({ AND: [where, { isNewLocation: true }] }),
        loginReportRepository.count({ AND: [where, { isImpossibleTravel: true }] }),
        // Logged in right now, so the date range doesn't apply.
        sessionRepository.countActiveByUser(scopeWhere(scope)),
      ]);

    const attempts = Object.fromEntries(
      Object.values(LoginStatus).map((status) => [
        status,
        byStatus.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as Record<LoginStatus, number>;

    return {
      ...dateRange(filters),
      attempts: { total: Object.values(attempts).reduce((sum, count) => sum + count, 0), ...attempts },
      uniqueUsers,
      uniqueDevices,
      loggedInNow: {
        users: active.length,
        devices: active.reduce((sum, row) => sum + row._count._all, 0),
      },
      flagged: { newDevice, newLocation, impossibleTravel },
      failuresByReason: byReason.map((row) => ({ reason: row.blockReason, count: row._count._all })),
      topCountries: byCountry.map((row) => ({ countryCode: row.countryCode, count: row._count._all })),
    };
  },

  // Streams the CSV in batches, so a large export never sits in memory at once.
  exportCsv: async function* (scope: ReportScope, filters: ReportFilters) {
    const where = buildWhere(scope, filters);
    yield CSV_COLUMNS.map(csvCell).join(',') + '\r\n';

    let beforeId: bigint | undefined;
    while (true) {
      const batch = await loginReportRepository.findBatch(where, beforeId, EXPORT_BATCH_SIZE);
      yield batch.map((event) => toCsvLine(toRow(event))).join('');

      if (batch.length < EXPORT_BATCH_SIZE) return;
      beforeId = batch[batch.length - 1].id;
    }
  },

  recordExport: (user: AuthUser, filters: ReportFilters, client: ClientInfo) => {
    const { from, to } = dateRange(filters);
    return activityLogService.record(
      {
        action: ACTIVITY_ACTIONS.loginReportExport,
        status: ActivityStatus.success,
        actorId: user.id,
        sessionId: user.sessionId,
        metadata: { ...filters, from: from.toISOString(), to: to.toISOString() },
      },
      client,
    );
  },
};
