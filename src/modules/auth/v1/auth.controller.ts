import type { Request, Response } from 'express';
import type { Portal } from '../../../config/portals.js';
import { authService } from '../auth.service.js';

// Each portal's router mounts its own login route with this, e.g. loginFor('agent').
export const loginFor = (portal: Portal) => async (req: Request, res: Response) => {
  const data = await authService.login(req.body, portal);

  res.json({
    success: true,
    message: data.mustChangePassword ? 'Password change required' : 'Login successful',
    data,
  });
};
