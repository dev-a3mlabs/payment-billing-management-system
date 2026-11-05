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

// Used when the lockout policy is off but the attempt must still count, like a wrong MFA code.
const FORCED_MAX_ATTEMPTS = 5;

export const userSecurityService = {
  // remainingAttempts is null when lockout is off for this user and alwaysCount is false.
  recordFailedLogin: async (
    user: { id: number; role: Role; security: UserSecurity | null },
    client: ClientInfo,
    alwaysCount = false,
  ) => {
    const { security } = user;
    if (security?.lockedAt) return { locked: true, remainingAttempts: 0 };

    const lockoutEnabled = await accessService.hasPermission(user, ACCESS_KEYS.lockoutEnabled);
    if (!lockoutEnabled && !alwaysCount) {
      return { locked: false, remainingAttempts: null };
    }

    const maxAttempts = lockoutEnabled
      ? await accessService.getNumber(user, ACCESS_KEYS.lockoutMaxAttempts)
      : FORCED_MAX_ATTEMPTS;
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

    return { locked: lock, remainingAttempts: maxAttempts - attempts };
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
