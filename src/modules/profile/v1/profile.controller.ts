import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { sessionService } from '../../session/session.service.js';
import { profileService } from '../profile.service.js';

export const profileController = {
  updateProfile: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const profile = await profileService.updateProfile(req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'Profile updated successfully', data: profile });
  },

  listSessions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await sessionService.list(user.id, user.sessionId);

    sendSuccess(res, { message: 'Sessions retrieved successfully', data });
  },

  revokeSession: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await sessionService.revokeOne(user.id, req.params.uuid as string);

    sendSuccess(res, { message: 'Device logged out successfully' });
  },
};
