import { AccessKind, AccessValueType, Role } from '../generated/prisma/enums.js';

export const ACCESS_KEYS = {
  agentCreate: 'user.agent.create',
  agentMax: 'user.agent.max',
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
  min?: number;
  max?: number;
};

// The single source of truth for every access key. Keep sorted by module, then key.
export const ACCESS_KEY_DEFINITIONS: AccessKeyDefinition[] = [
  {
    key: ACCESS_KEYS.agentCreate,
    label: 'Create agents',
    description: 'Admin can create agents',
    module: 'user',
    kind: AccessKind.permission,
    valueType: AccessValueType.bool,
    defaultValue: 'false',
    appliesTo: [Role.admin],
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
    min: 1,
    max: 1000,
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
  },
];
