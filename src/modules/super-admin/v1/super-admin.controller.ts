import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { generateTempPassword } from '../../../utils/password.js';
import { superAdminService } from '../super-admin.service.js';

export const superAdminController = {
  createUser: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const createdUser = await superAdminService.createUser(req.body, user);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: createdUser,
    });
  },

  generateTempPassword: (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Temporary password generated',
      data: { password: generateTempPassword() },
    });
  },
};
