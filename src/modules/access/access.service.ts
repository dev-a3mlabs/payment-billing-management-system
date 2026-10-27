import { ACCESS_KEY_DEFINITIONS, type AccessKeyDefinition } from '../../config/access-keys.js';
import { withTransaction } from '../../db/transaction.js';
import { AccessValueType, type Role } from '../../generated/prisma/enums.js';
import { ApiError, type ErrorDetail } from '../../utils/ApiError.js';
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

const findDefinition = (key: string, role: Role) =>
  ACCESS_KEY_DEFINITIONS.find((definition) => definition.key === key && definition.appliesTo.includes(role));

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

  getUserValues: async (user: AccessUser) => {
    const definitions = ACCESS_KEY_DEFINITIONS.filter((definition) => definition.appliesTo.includes(user.role));
    const accessKeys = await accessRepository.findKeysWithValues(
      definitions.map((definition) => definition.key),
      user.id,
      user.role,
    );
    const byKey = new Map(accessKeys.map((accessKey) => [accessKey.key, accessKey]));

    return definitions.map((definition) => {
      const userValue = byKey.get(definition.key)?.userValues[0]?.value;
      const roleValue = byKey.get(definition.key)?.roleValues[0]?.value;

      if (userValue !== undefined) {
        return { key: definition.key, value: toValue(definition.valueType, userValue), source: 'user' };
      }
      if (roleValue !== undefined) {
        return { key: definition.key, value: toValue(definition.valueType, roleValue), source: 'role' };
      }
      return { key: definition.key, value: toValue(definition.valueType, definition.defaultValue), source: 'default' };
    });
  },

  setUserValues: async (user: AccessUser, values: Record<string, unknown>, updatedById: number) => {
    const details: ErrorDetail[] = [];
    for (const [key, value] of Object.entries(values)) {
      const definition = findDefinition(key, user.role);
      const message = definition ? checkValue(definition, value) : 'Unknown permission';
      if (message) {
        details.push({ field: `values.${key}`, message });
      }
    }
    if (details.length > 0) {
      throw ApiError.validation(details);
    }

    await withTransaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await accessRepository.upsertUserValue(user.id, key, String(value), updatedById, tx);
      }
    });
  },

  resetUserValue: async (user: AccessUser, key: string) => {
    if (!findDefinition(key, user.role)) {
      throw ApiError.notFound('Permission not found');
    }
    await accessRepository.deleteUserValue(user.id, key);
  },
};
