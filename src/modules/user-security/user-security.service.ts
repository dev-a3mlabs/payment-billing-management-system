import { ACCESS_KEYS } from '../../config/access-keys.js';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import type { TxClient } from '../../db/transaction.js';
import type { UserSecurity } from '../../generated/prisma/client.js';
import { ActivityStatus, type Role } from '../../generated/prisma/enums.js';
import type { ClientInfo } from '../../utils/request.js';
import { accessService } from '../access/access.service.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { userSecurityRepository } from './user-security.repository.js';

// Wrong passwords older than this no longer count towards the lock.
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000;

export const userSecurityService = {
  recordFailedLogin: async (user: { id: number; role: Role; security: UserSecurity | null }, client: ClientInfo) => {
    const { security } = user;
    if (security?.lockedAt || !(await accessService.hasPermission(user, ACCESS_KEYS.lockoutEnabled))) return;

    const maxAttempts = await accessService.getNumber(user, ACCESS_KEYS.lockoutMaxAttempts);
    const attempts =
      security?.lastFailedLoginAt && Date.now() - security.lastFailedLoginAt.getTime() < ATTEMPT_WINDOW_MS
        ? security.failedLoginAttempts + 1
        : 1;
    const lock = attempts >= maxAttempts;

    await userSecurityRepository.saveFailedAttempt(user.id, attempts, lock);

    if (lock) {
      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.accountLocked,
          status: ActivityStatus.success,
          targetUserId: user.id,
          metadata: { attempts },
        },
        client,
      );
    }
  },

  resetAttempts: (userId: number, tx: TxClient) => userSecurityRepository.resetAttempts(userId, tx),

  unlock: async (userId: number, actorId: number, client: ClientInfo) => {
    const { count } = await userSecurityRepository.unlock(userId);
    if (count === 0) return;

    await activityLogService.record(
      { action: ACTIVITY_ACTIONS.accountUnlocked, status: ActivityStatus.success, actorId, targetUserId: userId },
      client,
    );
  },
};
