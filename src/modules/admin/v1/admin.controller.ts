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

  getAgentPermissions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await adminService.getAgentPermissions(req.params.uuid as string, user);

    sendSuccess(res, { message: 'Agent permissions retrieved successfully', data });
  },

  updateAgentPermissions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await adminService.updateAgentPermissions(req.params.uuid as string, req.body, user);

    sendSuccess(res, { message: 'Agent permissions updated successfully', data });
  },

  getAgentSessions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await adminService.getAgentSessions(req.params.uuid as string, user);

    sendSuccess(res, { message: 'Agent sessions retrieved successfully', data });
  },

  revokeAgentSessions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await adminService.revokeAgentSessions(req.params.uuid as string, user);

    sendSuccess(res, { message: 'Agent logged out from all devices successfully' });
  },

  changeAgentStatus: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await adminService.changeAgentStatus(req.params.uuid as string, req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'Agent status updated successfully' });
  },
};
