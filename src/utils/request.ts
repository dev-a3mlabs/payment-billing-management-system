import type { Request } from 'express';
import type { DeviceInfo } from './device.js';

export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
  device?: DeviceInfo;
};

// IPv4 clients reach a dual-stack socket as "::ffff:1.2.3.4"; store them as plain IPv4.
const IPV4_MAPPED_PREFIX = '::ffff:';
const normalizeIp = (ip?: string) =>
  ip?.startsWith(IPV4_MAPPED_PREFIX) && ip.includes('.') ? ip.slice(IPV4_MAPPED_PREFIX.length) : ip;

export const getClientInfo = (req: Request): ClientInfo => ({
  ipAddress: normalizeIp(req.ip),
  userAgent: req.get('user-agent')?.slice(0, 512),
});
