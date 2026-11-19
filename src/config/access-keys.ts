import { AccessKind, AccessValueType, Role } from '../generated/prisma/enums.js';

export const ACCESS_KEYS = {
  deviceLimitEnabled: 'auth.device_limit.enabled',
  deviceLimitMax: 'auth.device_limit.max_devices',
  lockoutEnabled: 'auth.lockout.enabled',
  lockoutMaxAttempts: 'auth.lockout.max_attempts',
  mfaRequired: 'auth.mfa.required',
  agentCreate: 'user.agent.create',
  agentDelete: 'user.agent.delete',
  agentMax: 'user.agent.max',
  agentMfaReset: 'user.agent.mfa_reset',
  agentSessionRevoke: 'user.agent.session_revoke',
  agentStatusChange: 'user.agent.status_change',
} as const;

export type AccessKeyDefinition = {
  key: string;
  label: string;
  description: string;
  module: string;
  kind: AccessKind;
  valueType: AccessValueType;
  defaultValue: string;
  appliesTo: Role[];
  editableBy: Role[];
  min?: number;
  max?: number;
};

// The single source of truth for every access key. Keep sorted by module, then key.
export const ACCESS_KEY_DEFINITIONS: AccessKeyDefinition[] = [
  {
    key: ACCESS_KEYS.deviceLimitEnabled,
    label: 'Limit logged-in devices',
    description: 'Limit how many devices can be logged in at the same time',
    module: 'auth',
    kind: AccessKind.policy,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin, Role.agent],
    editableBy: [Role.super_admin, Role.admin],
  },
  {
    key: ACCESS_KEYS.deviceLimitMax,
    label: 'Maximum devices',
    description: 'Devices that can be logged in at the same time',
    module: 'auth',
    kind: AccessKind.limit,
    valueType: AccessValueType.int,
    defaultValue: '5',
    appliesTo: [Role.admin, Role.agent],
    editableBy: [Role.super_admin, Role.admin],
    min: 1,
    max: 10,
  },
  {
    key: ACCESS_KEYS.lockoutEnabled,
    label: 'Lock account after wrong passwords',
    description: 'Lock the account after too many wrong passwords within 30 minutes',
    module: 'auth',
    kind: AccessKind.policy,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin, Role.agent],
    editableBy: [Role.super_admin, Role.admin],
  },
  {
    key: ACCESS_KEYS.lockoutMaxAttempts,
    label: 'Wrong password attempts allowed',
    description: 'Wrong passwords allowed within 30 minutes before the account is locked',
    module: 'auth',
    kind: AccessKind.limit,
    valueType: AccessValueType.int,
    defaultValue: '5',
    appliesTo: [Role.admin, Role.agent],
    editableBy: [Role.super_admin, Role.admin],
    min: 3,
    max: 20,
  },
  {
    key: ACCESS_KEYS.mfaRequired,
    label: 'Require MFA',
    description: 'Require an authenticator app code at every login',
    module: 'auth',
    kind: AccessKind.policy,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin, Role.agent],
    editableBy: [Role.super_admin, Role.admin],
  },
  {
    key: ACCESS_KEYS.agentCreate,
    label: 'Create agents',
    description: 'Admin can create agents',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
  },
  {
    key: ACCESS_KEYS.agentDelete,
    label: 'Delete agents',
    description: 'Admin can delete their agents',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
  },
  {
    key: ACCESS_KEYS.agentMax,
    label: 'Maximum agents',
    description: 'Maximum agents an admin can create',
    module: 'user',
    kind: AccessKind.limit,
    valueType: AccessValueType.int,
    defaultValue: '0',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
    min: 1,
    max: 1000,
  },
  {
    key: ACCESS_KEYS.agentMfaReset,
    label: 'Reset agent MFA',
    description: 'Admin can reset MFA for their agents',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
  },
  {
    key: ACCESS_KEYS.agentSessionRevoke,
    label: 'Log out agent devices',
    description: 'Admin can log out their agents from one device or all devices',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
  },
  {
    key: ACCESS_KEYS.agentStatusChange,
    label: 'Change agent status',
    description: 'Admin can activate and deactivate their agents',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
    editableBy: [Role.super_admin],
  },
];
