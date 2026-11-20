import bcrypt from 'bcrypt';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { CHANGE_REQUEST_FIELDS } from '../../config/change-request-fields.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { SECURITY_ALERT_TYPES } from '../../config/security-alert-types.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { prisma } from '../../db/prisma.js';
import { withTransaction, type TxClient } from '../../db/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, Role, UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { securityAlertRepository } from '../security-alert/security-alert.repository.js';
import { userRepository } from './user.repository.js';

export type AccountChange = { username?: string; email?: string; countryCode?: string; mobileNumber?: string };

export const changedFields = (change: AccountChange) => [
  ...(change.email !== undefined ? [CHANGE_REQUEST_FIELDS.email] : []),
  ...(change.mobileNumber !== undefined ? [CHANGE_REQUEST_FIELDS.mobile] : []),
  ...(change.username !== undefined ? [CHANGE_REQUEST_FIELDS.username] : []),
];

type CreateUserData = {
  username: string;
  password: string;
  role: Role;
  createdById: number;
  parentId?: number;
};

const REVOKE_REASONS = {
  [UserStatus.inactive]: SESSION_REVOKE_REASONS.accountInactive,
  [UserStatus.suspended]: SESSION_REVOKE_REASONS.accountSuspended,
  [UserStatus.deleted]: SESSION_REVOKE_REASONS.accountDeleted,
};

const applyStatus = async (
  target: { id: number; status: UserStatus },
  status: UserStatus,
  actorId: number,
  client: ClientInfo,
  tx: TxClient,
) => {
  await userRepository.updateStatus(target.id, status, tx);

  if (status !== UserStatus.active) {
    await authRepository.revokeAllSessions(target.id, REVOKE_REASONS[status], tx);
  }

  await activityLogService.record(
    {
      action: ACTIVITY_ACTIONS.statusChange,
      status: ActivityStatus.success,
      actorId,
      targetUserId: target.id,
      metadata: { from: target.status, to: status },
    },
    client,
    tx,
  );
};

export const userService = {
  create: async ({ password, ...data }: CreateUserData, tx: TxClient = prisma) => {
    if (await userRepository.isUsernameTaken(data.username, tx)) {
      throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      return await userRepository.create({ ...data, passwordHash }, tx);
    } catch (err) {
      // Another request took the same username between the check and the insert.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
      }
      throw err;
    }
  },

  assertAccountAvailable: async (change: AccountChange, tx: TxClient) => {
    if (change.username && (await userRepository.isUsernameTaken(change.username, tx))) {
      throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
    }
    if (change.email && (await userRepository.isEmailTaken(change.email, tx))) {
      throw ApiError.conflict('Email already in use', ERROR_CODES.EMAIL_TAKEN);
    }
    if (
      change.countryCode &&
      change.mobileNumber &&
      (await userRepository.isMobileTaken(change.countryCode, change.mobileNumber, tx))
    ) {
      throw ApiError.conflict('Mobile number already in use', ERROR_CODES.MOBILE_TAKEN);
    }
  },

  // Logs the user out of all devices (or all but keepSessionId) and raises a security alert.
  applyAccountChange: async (userId: number, change: AccountChange, tx: TxClient, keepSessionId?: number) => {
    try {
      await userRepository.updateAccount(userId, change, tx);
    } catch (err) {
      // Another request took the same value between the check and the update.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('Username, email or mobile number already in use');
      }
      throw err;
    }

    if (keepSessionId) {
      await authRepository.revokeOtherSessions(userId, keepSessionId, SESSION_REVOKE_REASONS.accountChanged, tx);
    } else {
      await authRepository.revokeAllSessions(userId, SESSION_REVOKE_REASONS.accountChanged, tx);
    }

    await securityAlertRepository.createMany(
      [{ userId, type: SECURITY_ALERT_TYPES.accountChanged, metadata: { fields: changedFields(change) } }],
      tx,
    );
  },

  // An agent can only use their account while their admin is active too.
  isActive: (user: { status: UserStatus; parent: { status: UserStatus } | null }) =>
    user.status === UserStatus.active && (!user.parent || user.parent.status === UserStatus.active),

  changeStatus: async (
    target: { id: number; role: Role; status: UserStatus },
    status: UserStatus,
    actorId: number,
    client: ClientInfo,
  ) => {
    if (target.status === status) return;

    await withTransaction(async (tx) => {
      await applyStatus(target, status, actorId, client, tx);

      // Deleting an admin also deletes their agents.
      if (status === UserStatus.deleted && target.role === Role.admin) {
        for (const agent of await userRepository.findChildren(target.id, tx)) {
          await applyStatus(agent, status, actorId, client, tx);
        }
      }
    });
  },
};
