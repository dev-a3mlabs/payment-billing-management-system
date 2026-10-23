import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { profileRepository } from './profile.repository.js';
import type { UpdateProfileInput } from './v1/profile.schema.js';

export const profileService = {
  updateProfile: async (input: UpdateProfileInput, user: AuthUser, client: ClientInfo) => {
    if (input.email && (await profileRepository.isEmailTaken(input.email, user.id))) {
      throw ApiError.conflict('Email already in use', ERROR_CODES.EMAIL_TAKEN);
    }

    if (
      input.countryCode &&
      input.mobileNumber &&
      (await profileRepository.isMobileTaken(input.countryCode, input.mobileNumber, user.id))
    ) {
      throw ApiError.conflict('Mobile number already in use', ERROR_CODES.MOBILE_TAKEN);
    }

    let profile;
    try {
      profile = await profileRepository.updateProfile(user.id, input);
    } catch (err) {
      // Another request took the same email or mobile between the check and the update.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('Email or mobile number already in use');
      }
      throw err;
    }

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
