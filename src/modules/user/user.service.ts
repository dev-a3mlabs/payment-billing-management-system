import bcrypt from 'bcrypt';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { prisma } from '../../db/prisma.js';
import { withTransaction, type TxClient } from '../../db/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, UserStatus, type Role } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { userRepository } from './user.repository.js';

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

  // An agent can only use their account while their admin is active too.
  isActive: (user: { status: UserStatus; parent: { status: UserStatus } | null }) =>
    user.status === UserStatus.active && (!user.parent || user.parent.status === UserStatus.active),

  changeStatus: async (target: { id: number; status: UserStatus }, status: UserStatus, actorId: number, client: ClientInfo) => {
    if (target.status === status) return;

    await withTransaction(async (tx) => {
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
    });
  },
};
