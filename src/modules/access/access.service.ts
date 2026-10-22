import type { Role } from '../../generated/prisma/enums.js';
import { accessRepository } from './access.repository.js';

type AccessUser = { id: number; role: Role };

// Resolves user value → role value → default; null if the key doesn't exist.
const resolveValue = async (user: AccessUser, key: string) => {
  const accessKey = await accessRepository.findKeyWithValues(key, user.id, user.role);
  if (!accessKey) return null;

  return accessKey.userValues[0]?.value ?? accessKey.roleValues[0]?.value ?? accessKey.defaultValue;
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
};
