import type { Role } from '../generated/prisma/enums.js';

export const Portal = {
  super_admin: 'super_admin',
  admin: 'admin',
  agent: 'agent',
  user: 'user',
} as const;

export type Portal = (typeof Portal)[keyof typeof Portal];

// The only place that decides which role logs in through which portal.
export const ROLE_PORTAL: Record<Role, Portal> = {
  super_admin_main: Portal.super_admin,
  super_admin: Portal.super_admin,
  admin: Portal.admin,
  agent: Portal.agent,
  user: Portal.user,
};
