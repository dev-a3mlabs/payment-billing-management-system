import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { changeRequestService } from '../change-request.service.js';
import type { ChangeRequestQuery } from './change-request.schema.js';

export const changeRequestController = {
  create: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await changeRequestService.create(req.body, user, getClientInfo(req));

    sendSuccess(res, { statusCode: 201, message: 'Change request sent successfully', data });
  },

  listOwn: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await changeRequestService.listOwn(user.id, req.query as unknown as ChangeRequestQuery);

    sendSuccess(res, { message: 'Change requests retrieved successfully', data });
  },

  cancel: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await changeRequestService.cancel(req.params.uuid as string, user, getClientInfo(req));

    sendSuccess(res, { message: 'Change request cancelled successfully' });
  },

  list: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await changeRequestService.list(user, req.query as unknown as ChangeRequestQuery);

    sendSuccess(res, { message: 'Change requests retrieved successfully', data });
  },

  get: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await changeRequestService.get(req.params.uuid as string, user);

    sendSuccess(res, { message: 'Change request retrieved successfully', data });
  },

  approve: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await changeRequestService.approve(req.params.uuid as string, user, getClientInfo(req));

    sendSuccess(res, { message: 'Change request approved successfully' });
  },

  reject: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await changeRequestService.reject(req.params.uuid as string, req.body.reason, user, getClientInfo(req));

    sendSuccess(res, { message: 'Change request rejected successfully' });
  },
};
