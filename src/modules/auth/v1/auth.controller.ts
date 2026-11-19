import type { Request, Response } from 'express';
import type { Portal } from '../../../config/portals.js';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { detectDevice } from '../../../utils/device.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { authService } from '../auth.service.js';

// Each portal's router mounts these through authRoutesFor(portal).
export const loginFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.login(req.body, portal, { ...getClientInfo(req), device: detectDevice(req) });

  if (data.mfaRequired) {
    return sendSuccess(res, { message: 'MFA code required', data });
  }
  sendSuccess(res, { message: data.mustChangePassword ? 'Password change required' : 'Login successful', data });
};

export const loginMfaFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.loginMfa(req.body, portal, { ...getClientInfo(req), device: detectDevice(req) });

  sendSuccess(res, { message: data.mustChangePassword ? 'Password change required' : 'Login successful', data });
};

export const refreshFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.refresh(req.body.refreshToken, portal, getClientInfo(req));

  sendSuccess(res, { message: 'Token refreshed', data });
};

export const changePassword = async (req: Request, res: Response) => {
  const { user } = req as AuthRequest;
  await authService.changePassword(req.body, user, getClientInfo(req));

  sendSuccess(res, { message: 'Password changed successfully' });
};

export const logout = async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);

  sendSuccess(res, { message: 'Logged out successfully' });
};
