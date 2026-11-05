import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { getClientInfo } from '../../../utils/request.js';
import { sendSuccess } from '../../../utils/response.js';
import { loginReportService } from '../login-report.service.js';
import { scopeFor } from '../report-scope.js';
import type { LoginHistoryQuery, LoginReportQuery } from './login-report.schema.js';

// Mounted in the super admin and admin portals; scopeFor limits an admin to their own agents.
export const loginReportController = {
  list: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await loginReportService.list(scopeFor(user), req.query as unknown as LoginReportQuery);

    sendSuccess(res, { message: 'Login report retrieved successfully', data });
  },

  summary: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const { page, ...filters } = req.query as unknown as LoginReportQuery;
    const data = await loginReportService.summary(scopeFor(user), filters);

    sendSuccess(res, { message: 'Login summary retrieved successfully', data });
  },

  exportCsv: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const { page, ...filters } = req.query as unknown as LoginReportQuery;
    await loginReportService.recordExport(user, filters, getClientInfo(req));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="login-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    await pipeline(Readable.from(loginReportService.exportCsv(scopeFor(user), filters)), res);
  },

  // Mounted in every portal's profile: the logged-in user's own logins.
  ownHistory: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const data = await loginReportService.list(
      { kind: 'self', userId: user.id },
      req.query as unknown as LoginHistoryQuery,
    );

    sendSuccess(res, { message: 'Login history retrieved successfully', data });
  },
};
