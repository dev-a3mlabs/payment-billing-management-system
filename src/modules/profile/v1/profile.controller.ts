import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { profileService } from '../profile.service.js';

export const profileController = {
  updateProfile: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const profile = await profileService.updateProfile(req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'Profile updated successfully', data: profile });
  },
};
