import type { Request, Response } from 'express';
import { SESSION_REVOKE_REASONS } from '../../../config/session-revoke-reasons.js';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { mfaService } from '../../mfa/mfa.service.js';
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
    await sessionService.revokeOne(
      user.id,
      req.params.uuid as string,
      SESSION_REVOKE_REASONS.revokedByUser,
      user,
      getClientInfo(req),
    );

    sendSuccess(res, { message: 'Device logged out successfully' });
  },

  getMfa: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await mfaService.getStatus(user);

    sendSuccess(res, { message: 'MFA status retrieved successfully', data });
  },

  setupMfa: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await mfaService.setup(user, getClientInfo(req));

    sendSuccess(res, { message: 'Scan the QR code with your authenticator app', data });
  },

  enableMfa: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await mfaService.enable(req.body.code, user, getClientInfo(req));

    sendSuccess(res, { message: 'MFA enabled successfully. Save your recovery codes now.', data });
  },

  disableMfa: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await mfaService.disable(req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'MFA disabled successfully' });
  },
};
