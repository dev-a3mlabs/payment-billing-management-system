import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { SECURITY_ALERT_TYPES, type SecurityAlertType } from '../../config/security-alert-types.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { decimalToNumber } from '../../utils/decimal.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import type { LoginPlace } from '../auth/login-event.js';
import { scopeWhere, type ReportScope } from '../login-report/report-scope.js';
import { securityAlertRepository } from './security-alert.repository.js';

const PAGE_SIZE = 20;

const SPIKE_FAILURES = 10;
const SPIKE_WINDOW_MINUTES = 15;

// Faster than a plane, over a distance that IP location errors can't explain.
const MIN_TRAVEL_KM = 100;
const MAX_TRAVEL_KMH = 900;
const EARTH_RADIUS_KM = 6371;

type Point = { latitude: number; longitude: number };

// Straight-line distance over the earth's surface.
const distanceKm = (a: Point, b: Point) => {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

type Place = { city: string | null; countryCode: string | null };

type LoginSignals = {
  isNewDevice: boolean;
  isNewLocation: boolean;
  isImpossibleTravel: boolean;
  travel: { from: Place; to: Place; distanceKm: number; minutes: number } | null;
};

export const securityAlertService = {
  // Compares a successful login with the user's earlier ones.
  detectLoginSignals: async (userId: number, place: LoginPlace, tx: TxClient): Promise<LoginSignals> => {
    const last = await securityAlertRepository.findLastSuccessfulLogin(userId, tx);
    // Everything looks new on a user's first login, so it isn't flagged.
    if (!last) return { isNewDevice: false, isNewLocation: false, isImpossibleTravel: false, travel: null };

    const isNewDevice =
      place.visitorId !== undefined && !(await securityAlertRepository.hasLoggedInFromDevice(userId, place.visitorId, tx));
    const isNewLocation =
      place.countryCode !== undefined &&
      !(await securityAlertRepository.hasLoggedInFromPlace(userId, place.countryCode, place.city ?? null, tx));

    let travel = null;
    if (last.latitude && last.longitude && place.latitude !== undefined && place.longitude !== undefined) {
      const km = distanceKm(
        { latitude: last.latitude.toNumber(), longitude: last.longitude.toNumber() },
        { latitude: place.latitude, longitude: place.longitude },
      );
      const hours = (Date.now() - last.createdAt.getTime()) / (60 * 60 * 1000);

      if (km > MIN_TRAVEL_KM && km / hours > MAX_TRAVEL_KMH) {
        travel = {
          from: { city: last.city, countryCode: last.countryCode },
          to: { city: place.city ?? null, countryCode: place.countryCode ?? null },
          distanceKm: Math.round(km),
          minutes: Math.round(hours * 60),
        };
      }
    }

    return { isNewDevice, isNewLocation, isImpossibleTravel: travel !== null, travel };
  },

  raiseLoginAlerts: async (userId: number, loginEventId: bigint, signals: LoginSignals, tx: TxClient) => {
    const alert = (type: SecurityAlertType, metadata?: Prisma.InputJsonValue) => ({ userId, loginEventId, type, metadata });
    const alerts = [
      ...(signals.isNewDevice ? [alert(SECURITY_ALERT_TYPES.newDevice)] : []),
      ...(signals.isNewLocation ? [alert(SECURITY_ALERT_TYPES.newLocation)] : []),
      ...(signals.travel ? [alert(SECURITY_ALERT_TYPES.impossibleTravel, signals.travel)] : []),
    ];

    if (alerts.length > 0) {
      await securityAlertRepository.createMany(alerts, tx);
    }
  },

  // Fires once when the failures reach the limit, not again for every failure after it.
  checkFailedLoginSpike: async (userId: number, loginEventId: bigint) => {
    const since = new Date(Date.now() - SPIKE_WINDOW_MINUTES * 60 * 1000);
    const failures = await securityAlertRepository.countFailedLoginsSince(userId, since);
    if (failures !== SPIKE_FAILURES) return;

    await securityAlertRepository.createMany([
      {
        userId,
        loginEventId,
        type: SECURITY_ALERT_TYPES.failedLoginSpike,
        metadata: { failures, windowMinutes: SPIKE_WINDOW_MINUTES },
      },
    ]);
  },

  list: async (
    scope: ReportScope,
    { page, userUuid, type, resolved }: { page: number; userUuid?: string; type?: string; resolved?: boolean },
  ) => {
    // The scope stays in every query, so a user outside it simply returns nothing.
    const whose: Prisma.SecurityAlertWhereInput = {
      AND: [scopeWhere(scope), userUuid ? { user: { is: { uuid: userUuid } } } : {}],
    };
    const where: Prisma.SecurityAlertWhereInput = {
      AND: [whose, type ? { type } : {}, resolved === undefined ? {} : { resolvedAt: resolved ? { not: null } : null }],
    };

    const [alerts, total, unresolvedCount] = await Promise.all([
      securityAlertRepository.findPage(where, page, PAGE_SIZE),
      securityAlertRepository.count(where),
      securityAlertRepository.count({ AND: [whose, { resolvedAt: null }] }),
    ]);

    return {
      items: alerts.map(({ loginEvent, ...alert }) => ({
        ...alert,
        loginEvent: loginEvent && {
          ...loginEvent,
          latitude: decimalToNumber(loginEvent.latitude),
          longitude: decimalToNumber(loginEvent.longitude),
        },
      })),
      unresolvedCount,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    };
  },

  resolve: async (id: number, scope: ReportScope, resolver: AuthUser, client: ClientInfo) => {
    const alert = await securityAlertRepository.findOne({ AND: [{ id }, scopeWhere(scope)] });
    if (!alert) {
      throw ApiError.notFound('Alert not found');
    }
    if ((await securityAlertRepository.resolve(id, resolver.id)).count === 0) return;

    await activityLogService.record(
      {
        action: ACTIVITY_ACTIONS.securityAlertResolve,
        status: ActivityStatus.success,
        actorId: resolver.id,
        targetUserId: alert.userId,
        sessionId: resolver.sessionId,
        metadata: { alertId: id },
      },
      client,
    );
  },
};
