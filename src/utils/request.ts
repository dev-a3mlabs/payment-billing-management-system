import type { Request } from 'express';
import type { DeviceInfo } from './device.js';

export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
  device?: DeviceInfo;
};

export const getClientInfo = (req: Request): ClientInfo => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 512),
});
