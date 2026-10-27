import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { adminService } from '../admin.service.js';

export const adminController = {
  createAgent: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const agent = await adminService.createAgent(req.body, user);

    sendSuccess(res, { statusCode: 201, message: 'Agent created successfully', data: agent });
  },

  getPermissions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await adminService.getPermissions(user);

    sendSuccess(res, { message: 'Permissions retrieved successfully', data });
  },

  getAgentQuota: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await adminService.getAgentQuota(user);

    sendSuccess(res, { message: 'Agent quota retrieved successfully', data });
  },

  changeAgentStatus: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await adminService.changeAgentStatus(req.params.uuid as string, req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'Agent status updated successfully' });
  },
};
