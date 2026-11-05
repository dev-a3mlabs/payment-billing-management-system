import { Role } from '../../generated/prisma/enums.js';

// Whose data a report may show: everyone the super admin manages, one admin's agents, or one user's own.
export type ReportScope =
  | { kind: 'managed' }
  | { kind: 'agentsOf'; adminId: number }
  | { kind: 'self'; userId: number };

const MANAGED_ROLES: Role[] = [Role.admin, Role.agent];

export const scopeFor = (user: { id: number; role: Role }): ReportScope =>
  user.role === Role.super_admin ? { kind: 'managed' } : { kind: 'agentsOf', adminId: user.id };

// Filter for any table with a userId and a user relation, so every query is limited in the database itself.
export const scopeWhere = (scope: ReportScope) => {
  if (scope.kind === 'self') return { userId: scope.userId };
  if (scope.kind === 'agentsOf') return { user: { is: { parentId: scope.adminId, role: Role.agent } } };
  return { user: { is: { role: { in: MANAGED_ROLES } } } };
};
