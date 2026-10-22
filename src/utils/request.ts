import type { Request } from 'express';

export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
};

export const getClientInfo = (req: Request): ClientInfo => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 512),
});
