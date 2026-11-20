import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { CHANGE_REQUEST_FIELDS, type ChangeRequestField } from '../../config/change-request-fields.js';
import { NOTIFICATION_TYPES } from '../../config/notification-types.js';
import { withTransaction, type TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, ChangeRequestStatus, Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { scopeFor, scopeWhere } from '../login-report/report-scope.js';
import { notificationService } from '../notification/notification.service.js';
import { userRepository } from '../user/user.repository.js';
import { userService, type AccountChange } from '../user/user.service.js';
import { changeRequestRepository } from './change-request.repository.js';
import {
  CHANGE_REQUEST_EXPIRED,
  type ChangeRequestQuery,
  type CreateChangeRequestInput,
} from './v1/change-request.schema.js';

const PAGE_SIZE = 20;
const DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRES_IN_MS = 7 * DAY_MS;
const NOT_PENDING = 'This request is no longer pending';

type ChangeRequest = NonNullable<Awaited<ReturnType<typeof changeRequestRepository.findOne>>>;
type Account = Awaited<ReturnType<typeof userRepository.findAccount>>;

const isPending = (request: ChangeRequest) =>
  request.status === ChangeRequestStatus.pending && request.expiresAt > new Date();

// An admin decides their own agents' requests (the scope already limits them to those). The super admin
// decides admins' requests, and an agent's request only while that agent's admin isn't active.
const canDecide = (request: ChangeRequest, reviewer: AuthUser) =>
  isPending(request) &&
  (reviewer.role === Role.admin ||
    request.user.role === Role.admin ||
    request.user.parent?.status !== UserStatus.active);

const toResponse = (request: ChangeRequest, reviewer?: AuthUser) => {
  const { id: _id, userId: _userId, user: { parent: _parent, ...user }, ...rest } = request;
  return {
    ...rest,
    status: request.status === ChangeRequestStatus.pending && !isPending(request) ? CHANGE_REQUEST_EXPIRED : request.status,
    user,
    ...(reviewer && { canDecide: canDecide(request, reviewer) }),
  };
};

const statusWhere = (status?: ChangeRequestQuery['status']): Prisma.ChangeRequestWhereInput => {
  if (status === CHANGE_REQUEST_EXPIRED) return { status: ChangeRequestStatus.pending, expiresAt: { lte: new Date() } };
  if (status === ChangeRequestStatus.pending) return changeRequestRepository.pendingWhere();
  return status ? { status } : {};
};

const currentValue = (account: Account, field: ChangeRequestField) => {
  if (field === CHANGE_REQUEST_FIELDS.email) return { email: account.email };
  if (field === CHANGE_REQUEST_FIELDS.mobile) return { countryCode: account.countryCode, mobileNumber: account.mobileNumber };
  return { username: account.username };
};

// Who is notified about a new or cancelled request: the user's admin, or the super admin.
const reviewerIds = (account: Account, tx: TxClient) =>
  account.role === Role.agent && account.parentId && account.parent?.status === UserStatus.active
    ? Promise.resolve([account.parentId])
    : userRepository.findIdsByRole(Role.super_admin, tx);


const paginate = async (where: Prisma.ChangeRequestWhereInput, page: number, reviewer?: AuthUser) => {
  const [requests, total] = await Promise.all([
    changeRequestRepository.findPage(where, page, PAGE_SIZE),
    changeRequestRepository.count(where),
  ]);

  return {
    items: requests.map((request) => toResponse(request, reviewer)),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
  };
};

const findForReviewer = async (uuid: string, reviewer: AuthUser) => {
  const request = await changeRequestRepository.findOne({ AND: [scopeWhere(scopeFor(reviewer)), { uuid }] });
  if (!request) {
    throw ApiError.notFound('Change request not found');
  }
  return request;
};

const assertCanDecide = (request: ChangeRequest, reviewer: AuthUser) => {
  if (!isPending(request)) {
    throw ApiError.conflict(NOT_PENDING);
  }
  if (!canDecide(request, reviewer)) {
    throw ApiError.forbidden('You can only view this request');
  }
};

export const changeRequestService = {
  create: async (input: CreateChangeRequestInput, requester: AuthUser, client: ClientInfo) => {

    const { request, notifications } = await withTransaction(async (tx) => {
      // Locks the user row so two parallel requests can't both pass the checks below.
      await userRepository.lockById(requester.id, tx);

      if ((await changeRequestRepository.countSince(requester.id, new Date(Date.now() - DAY_MS), tx)) >= DAILY_LIMIT) {
        throw ApiError.tooManyRequests('You have reached the daily limit of change requests. Please try again later.');
      }
      if (await changeRequestRepository.hasPending(requester.id, input.field, tx)) {
        throw ApiError.conflict('You already have a pending request for this field');
      }

      const account = await userRepository.findAccount(requester.id, tx);
      const oldValue = currentValue(account, input.field);
      if (JSON.stringify(oldValue) === JSON.stringify(input.newValue)) {
        throw ApiError.badRequest('New value must be different from the current one');
      }
      await userService.assertAccountAvailable(input.newValue, tx);

      const request = await changeRequestRepository.create(
        {
          userId: requester.id,
          field: input.field,
          oldValue,
          newValue: input.newValue,
          expiresAt: new Date(Date.now() + EXPIRES_IN_MS),
        },
        tx,
      );

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.changeRequestCreate,
          status: ActivityStatus.success,
          actorId: requester.id,
          targetUserId: requester.id,
          sessionId: requester.sessionId,
          metadata: { requestUuid: request.uuid, field: input.field },
        },
        client,
        tx,
      );

      const notifications = await notificationService.create(
        await reviewerIds(account, tx),
        {
          type: NOTIFICATION_TYPES.changeRequestCreated,
          entityId: request.uuid,
          metadata: { username: account.username, field: input.field },
        },
        tx,
      );

      return { request, notifications };
    });

    notificationService.publish(notifications);
    return toResponse(request);
  },

  listOwn: (userId: number, { page, status }: ChangeRequestQuery) =>
    paginate({ AND: [{ userId }, statusWhere(status)] }, page),

  cancel: async (uuid: string, requester: AuthUser, client: ClientInfo) => {
    const notifications = await withTransaction(async (tx) => {
      const request = await changeRequestRepository.findOne({ uuid, userId: requester.id }, tx);
      if (!request) {
        throw ApiError.notFound('Change request not found');
      }
      if ((await changeRequestRepository.decide(request.id, { status: ChangeRequestStatus.cancelled }, tx)).count === 0) {
        throw ApiError.conflict(NOT_PENDING);
      }

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.changeRequestCancel,
          status: ActivityStatus.success,
          actorId: requester.id,
          targetUserId: requester.id,
          sessionId: requester.sessionId,
          metadata: { requestUuid: uuid, field: request.field },
        },
        client,
        tx,
      );

      const account = await userRepository.findAccount(requester.id, tx);
      return notificationService.create(
        await reviewerIds(account, tx),
        {
          type: NOTIFICATION_TYPES.changeRequestCancelled,
          entityId: uuid,
          metadata: { username: account.username, field: request.field },
        },
        tx,
      );
    });

    notificationService.publish(notifications);
  },

  list: (reviewer: AuthUser, { page, status }: ChangeRequestQuery) =>
    paginate({ AND: [scopeWhere(scopeFor(reviewer)), statusWhere(status)] }, page, reviewer),

  get: async (uuid: string, reviewer: AuthUser) => toResponse(await findForReviewer(uuid, reviewer), reviewer),

  approve: async (uuid: string, reviewer: AuthUser, client: ClientInfo) => {
    const request = await findForReviewer(uuid, reviewer);
    assertCanDecide(request, reviewer);

    const notifications = await withTransaction(async (tx) => {
      const { count } = await changeRequestRepository.decide(
        request.id,
        { status: ChangeRequestStatus.approved, decidedById: reviewer.id },
        tx,
      );
      if (count === 0) {
        throw ApiError.conflict(NOT_PENDING);
      }

      const account = await userRepository.findAccount(request.userId, tx);
      if (account.status !== UserStatus.active) {
        throw ApiError.conflict('This request can no longer be approved');
      }

      const change = request.newValue as AccountChange;
      await userService.assertAccountAvailable(change, tx);
      await userService.applyAccountChange(account.id, change, tx);

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.changeRequestApprove,
          status: ActivityStatus.success,
          actorId: reviewer.id,
          targetUserId: account.id,
          sessionId: reviewer.sessionId,
          metadata: { requestUuid: uuid, field: request.field },
        },
        client,
        tx,
      );

      return notificationService.create(
        [account.id],
        { type: NOTIFICATION_TYPES.changeRequestApproved, entityId: uuid, metadata: { field: request.field } },
        tx,
      );
    });

    notificationService.publish(notifications);
  },

  reject: async (uuid: string, reason: string, reviewer: AuthUser, client: ClientInfo) => {
    const request = await findForReviewer(uuid, reviewer);
    assertCanDecide(request, reviewer);

    const notifications = await withTransaction(async (tx) => {
      const { count } = await changeRequestRepository.decide(
        request.id,
        { status: ChangeRequestStatus.rejected, decidedById: reviewer.id, rejectReason: reason },
        tx,
      );
      if (count === 0) {
        throw ApiError.conflict(NOT_PENDING);
      }

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.changeRequestReject,
          status: ActivityStatus.success,
          actorId: reviewer.id,
          targetUserId: request.userId,
          sessionId: reviewer.sessionId,
          metadata: { requestUuid: uuid, field: request.field },
        },
        client,
        tx,
      );

      return notificationService.create(
        [request.userId],
        { type: NOTIFICATION_TYPES.changeRequestRejected, entityId: uuid, metadata: { field: request.field } },
        tx,
      );
    });

    notificationService.publish(notifications);
  },
};
