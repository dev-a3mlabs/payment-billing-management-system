import { ACCESS_KEY_DEFINITIONS, type AccessKeyDefinition } from '../../config/access-keys.js';
import { ACTIVITY_ACTIONS } from '../../config/activity-actions.js';
import { withTransaction } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AccessValueType, ActivityStatus, Role } from '../../generated/prisma/enums.js';
import { ApiError, type ErrorDetail } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogService } from '../activity-log/activity-log.service.js';
import { accessRepository } from './access.repository.js';

type AccessUser = { id: number; role: Role };

// Resolves user value → role value → default; null if the key doesn't exist.
const resolveValue = async (user: AccessUser, key: string) => {
  const accessKey = await accessRepository.findKeyWithValues(key, user.id, user.role);
  if (!accessKey) return null;

  return accessKey.userValues[0]?.value ?? accessKey.roleValues[0]?.value ?? accessKey.defaultValue;
};

const toValue = (valueType: AccessValueType, raw: string) => {
  if (valueType === AccessValueType.bool) return raw === 'true';
  if (valueType === AccessValueType.int) return Number(raw);
  return raw;
};

// Definitions that apply to this user and, when an editor is given, that the editor may change.
const definitionsFor = (role: Role, editorRole?: Role) =>
  ACCESS_KEY_DEFINITIONS.filter(
    (definition) => definition.appliesTo.includes(role) && (!editorRole || definition.editableBy.includes(editorRole)),
  );

const findDefinition = (key: string, role: Role, editorRole: Role) =>
  definitionsFor(role, editorRole).find((definition) => definition.key === key);

// Keys a super admin can let an admin manage for their agents.
const grantableKeys = () => definitionsFor(Role.agent, Role.admin).map((definition) => definition.key);

// Returns an error message, or null if the value is valid for this key.
const checkValue = (definition: AccessKeyDefinition, value: unknown) => {
  if (definition.valueType === AccessValueType.bool) {
    return typeof value === 'boolean' ? null : 'Must be true or false';
  }
  if (definition.valueType === AccessValueType.int) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return 'Must be a whole number';
    if (definition.min !== undefined && value < definition.min) return `Must be at least ${definition.min}`;
    if (definition.max !== undefined && value > definition.max) return `Must be at most ${definition.max}`;
    return null;
  }
  return typeof value === 'string' ? null : 'Must be text';
};

export const accessService = {
  hasPermission: async (user: AccessUser, key: string) => (await resolveValue(user, key)) === 'true',

  getNumber: async (user: AccessUser, key: string) => {
    const raw = await resolveValue(user, key);
    const value = Number(raw);
    if (raw === null || !Number.isInteger(value)) {
      throw new Error(`Access key "${key}" is missing or not a number`);
    }
    return value;
  },

  listDefinitions: () =>
    ACCESS_KEY_DEFINITIONS.map((definition) => ({
      ...definition,
      defaultValue: toValue(definition.valueType, definition.defaultValue),
    })),

  getUserValues: async (user: AccessUser, editorRole?: Role) => {
    const definitions = definitionsFor(user.role, editorRole);
    const accessKeys = await accessRepository.findKeysWithValues(
      definitions.map((definition) => definition.key),
      user.id,
      user.role,
    );
    const byKey = new Map(accessKeys.map((accessKey) => [accessKey.key, accessKey]));

    return definitions.map((definition) => {
      const userValue = byKey.get(definition.key)?.userValues[0];
      const roleValue = byKey.get(definition.key)?.roleValues[0]?.value;

      if (userValue) {
        return {
          key: definition.key,
          value: toValue(definition.valueType, userValue.value),
          source: 'user',
          locked: userValue.locked,
        };
      }
      if (roleValue !== undefined) {
        return { key: definition.key, value: toValue(definition.valueType, roleValue), source: 'role', locked: false };
      }
      return {
        key: definition.key,
        value: toValue(definition.valueType, definition.defaultValue),
        source: 'default',
        locked: false,
      };
    });
  },

  // Values set by the super admin are locked, so an admin can't change them.
  setUserValues: async (user: AccessUser, values: Record<string, unknown>, editor: AccessUser, client: ClientInfo) => {
    const details: ErrorDetail[] = [];
    for (const [key, value] of Object.entries(values)) {
      const definition = findDefinition(key, user.role, editor.role);
      const message = definition ? checkValue(definition, value) : 'Unknown permission';
      if (message) {
        details.push({ field: `values.${key}`, message });
      }
    }
    if (details.length > 0) {
      throw ApiError.validation(details);
    }

    const locked = editor.role === Role.super_admin;
    await withTransaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await accessRepository.upsertUserValue(user.id, key, String(value), locked, editor.id, tx);
      }

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.accessValueUpdate,
          status: ActivityStatus.success,
          actorId: editor.id,
          targetUserId: user.id,
          metadata: { values: values as Prisma.InputJsonObject, locked },
        },
        client,
        tx,
      );
    });
  },

  resetUserValue: async (user: AccessUser, key: string, editorRole: Role) => {
    if (!findDefinition(key, user.role, editorRole)) {
      throw ApiError.notFound('Permission not found');
    }
    await accessRepository.deleteUserValue(user.id, key);
  },

  unlockUserValue: async (user: AccessUser, key: string, actorId: number, client: ClientInfo) => {
    const { count } = await accessRepository.unlockUserValue(user.id, key);
    if (count === 0) return;

    await activityLogService.record(
      {
        action: ACTIVITY_ACTIONS.accessValueUnlock,
        status: ActivityStatus.success,
        actorId,
        targetUserId: user.id,
        metadata: { key },
      },
      client,
    );
  },

  getGrantedKeys: (user: AccessUser) => accessRepository.findGrantedKeys(user.id),

  getGrants: async (user: AccessUser) => {
    const grantedKeys = await accessRepository.findGrantedKeys(user.id);
    return grantableKeys().map((key) => ({ key, granted: grantedKeys.includes(key) }));
  },

  // Replaces the whole set; values the admin already set for agents stay as they are.
  setGrants: async (user: AccessUser, keys: string[], editor: AccessUser, client: ClientInfo) => {
    const allowedKeys = grantableKeys();
    const details: ErrorDetail[] = keys.flatMap((key, index) =>
      allowedKeys.includes(key) ? [] : [{ field: `keys.${index}`, message: 'Unknown permission' }],
    );
    if (details.length > 0) {
      throw ApiError.validation(details);
    }

    const currentKeys = await accessRepository.findGrantedKeys(user.id);
    const granted = keys.filter((key) => !currentKeys.includes(key));
    const revoked = currentKeys.filter((key) => !keys.includes(key));
    if (granted.length === 0 && revoked.length === 0) return;

    await withTransaction(async (tx) => {
      await accessRepository.replaceGrants(user.id, keys, editor.id, tx);

      await activityLogService.record(
        {
          action: ACTIVITY_ACTIONS.accessGrantChange,
          status: ActivityStatus.success,
          actorId: editor.id,
          targetUserId: user.id,
          metadata: { granted, revoked },
        },
        client,
        tx,
      );
    });
  },
};
