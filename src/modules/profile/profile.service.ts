import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { ActivityStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { profileRepository } from './profile.repository.js';
import type { UpdateProfileInput } from './v1/profile.schema.js';

export const profileService = {
  updateProfile: async (input: UpdateProfileInput, user: AuthUser, client: ClientInfo) => {
    const profile = await profileRepository.updateProfile(user.id, input);

    await activityLogService.record(
      {
        action: ACTIVITY_ACTIONS.profileUpdate,
        status: ActivityStatus.success,
        actorId: user.id,
        targetUserId: user.id,
        sessionId: user.sessionId,
        metadata: { fields: Object.keys(input) },
      },
      client,
    );

    return profile;
  },
};
