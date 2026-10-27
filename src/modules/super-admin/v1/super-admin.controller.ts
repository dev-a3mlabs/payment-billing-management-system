import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { generateTempPassword } from '../../../utils/password.js';
import { getClientInfo } from '../../../utils/request.js';
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

  listAdmins: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const admins = await superAdminService.listAdmins(user);

    sendSuccess(res, { message: 'Admins retrieved successfully', data: admins });
  },

  listPermissions: (_req: Request, res: Response) => {
    sendSuccess(res, { message: 'Permissions retrieved successfully', data: superAdminService.listPermissions() });
  },

  getUserPermissions: async (req: Request, res: Response) => {
    const data = await superAdminService.getUserPermissions(req.params.uuid as string);

    sendSuccess(res, { message: 'User permissions retrieved successfully', data });
  },

  updateUserPermissions: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await superAdminService.updateUserPermissions(req.params.uuid as string, req.body, user);

    sendSuccess(res, { message: 'User permissions updated successfully', data });
  },

  resetUserPermission: async (req: Request, res: Response) => {
    const data = await superAdminService.resetUserPermission(req.params.uuid as string, req.params.key as string);

    sendSuccess(res, { message: 'User permission reset successfully', data });
  },

  changeUserStatus: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await superAdminService.changeUserStatus(req.params.uuid as string, req.body, user, getClientInfo(req));

    sendSuccess(res, { message: 'User status updated successfully' });
  },

  unlockUser: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await superAdminService.unlockUser(req.params.uuid as string, user, getClientInfo(req));

    sendSuccess(res, { message: 'User unlocked successfully' });
  },

  deleteUser: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await superAdminService.deleteUser(req.params.uuid as string, user, getClientInfo(req));

    sendSuccess(res, { message: 'User deleted successfully' });
  },
};
