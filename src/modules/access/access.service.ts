import type { Role } from '../../generated/prisma/enums.js';
import { accessRepository } from './access.repository.js';

export const accessService = {
  // Resolves user value → role value → default.
  hasPermission: async (user: { id: number; role: Role }, key: string) => {
    const accessKey = await accessRepository.findKeyWithValues(key, user.id, user.role);
    if (!accessKey) return false;

    const value = accessKey.userValues[0]?.value ?? accessKey.roleValues[0]?.value ?? accessKey.defaultValue;
    return value === 'true';
  },
};
