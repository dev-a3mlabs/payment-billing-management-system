import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { sendSuccess } from '../../../utils/response.js';
import { adminService } from '../admin.service.js';

export const adminController = {
  createAgent: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const agent = await adminService.createAgent(req.body, user);

    sendSuccess(res, { statusCode: 201, message: 'Agent created successfully', data: agent });
  },
};
