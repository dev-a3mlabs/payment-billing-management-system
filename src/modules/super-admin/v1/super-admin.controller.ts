import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { generateTempPassword } from '../../../utils/password.js';
import { sendSuccess } from '../../../utils/response.js';
import { superAdminService } from '../super-admin.service.js';

export const superAdminController = {
  createUser: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const createdUser = await superAdminService.createUser(req.body, user);

    sendSuccess(res, { statusCode: 201, message: 'User created successfully', data: createdUser });
  },

  checkUsername: async (req: Request, res: Response) => {
    const data = await superAdminService.checkUsername(req.query.username as string);

    sendSuccess(res, { message: data.available ? 'Username is available' : 'Username is already taken', data });
  },

  generateTempPassword: (_req: Request, res: Response) => {
    sendSuccess(res, { message: 'Temporary password generated', data: { password: generateTempPassword() } });
  },
};
