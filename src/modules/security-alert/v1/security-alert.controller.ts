import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { scopeFor } from '../../login-report/report-scope.js';
import { securityAlertService } from '../security-alert.service.js';
import type { SecurityAlertQuery } from './security-alert.schema.js';

// Mounted in the super admin and admin portals; scopeFor limits an admin to their own agents.
export const securityAlertController = {
  list: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await securityAlertService.list(scopeFor(user), req.query as unknown as SecurityAlertQuery);

    sendSuccess(res, { message: 'Security alerts retrieved successfully', data });
  },

  resolve: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const { id } = req.params as unknown as { id: number };
    await securityAlertService.resolve(id, scopeFor(user), user, getClientInfo(req));

    sendSuccess(res, { message: 'Security alert resolved successfully' });
  },

  // Mounted in every portal's profile: alerts about the logged-in user, read-only.
  ownList: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await securityAlertService.list(
      { kind: 'self', userId: user.id },
      req.query as unknown as SecurityAlertQuery,
    );

    sendSuccess(res, { message: 'Security alerts retrieved successfully', data });
  },
};
