import bcrypt from 'bcrypt';
import { ACCESS_KEYS } from '../../config/access-keys.js';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { accessService } from '../access/access.service.js';
import { superAdminRepository } from './super-admin.repository.js';
import type { CreateUserInput } from './v1/super-admin.schema.js';

export const superAdminService = {
  createUser: async ({ username, password, role }: CreateUserInput, creator: AuthUser) => {
    if (role === Role.super_admin && !(await accessService.hasPermission(creator, ACCESS_KEYS.superAdminCreate))) {
      throw ApiError.forbidden('You do not have permission to create super admins');
    }

    const existing = await superAdminRepository.findUserByUsername(username);
    if (existing) {
      throw ApiError.conflict('Username already taken');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return superAdminRepository.createUser({ username, passwordHash, role, createdById: creator.id });
  },
};
