import type { Request, Response } from 'express';
import type { Portal } from '../../../config/portals.js';
import { getClientInfo } from '../../../utils/request.js';
import { authService } from '../auth.service.js';

// Each portal's router mounts these through authRoutesFor(portal).
export const loginFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.login(req.body, portal, getClientInfo(req));

  res.json({
    success: true,
    message: data.mustChangePassword ? 'Password change required' : 'Login successful',
    data,
  });
};

export const refreshFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.refresh(req.body.refreshToken, portal, getClientInfo(req));

  res.json({ success: true, message: 'Token refreshed', data });
};

export const logout = async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);

  res.json({ success: true, message: 'Logged out successfully' });
};
