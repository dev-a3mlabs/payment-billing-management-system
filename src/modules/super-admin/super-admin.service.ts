import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { ACCESS_KEYS } from '../../config/access-keys.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { accessService } from '../access/access.service.js';
import { superAdminRepository } from './super-admin.repository.js';
import type { CreateUserInput } from './v1/super-admin.schema.js';

const MAX_USERNAME_LENGTH = 30;
const SUGGESTION_COUNT = 3;

// Every suffix ends with a digit, so a candidate never ends with a dot.
const buildUsernameCandidates = (username: string) => {
  const suffixes = ['1', '_1', '.1', '2', '_2', '.2', '3', '_3'];
  for (let i = 0; i < 4; i++) {
    suffixes.push(String(randomInt(10, 1000)), `_${randomInt(10, 1000)}`);
  }

  const candidates = suffixes.map((suffix) => username.slice(0, MAX_USERNAME_LENGTH - suffix.length) + suffix);
  return [...new Set(candidates)].filter((candidate) => candidate !== username);
};

export const superAdminService = {
  checkUsername: async (username: string) => {
    if (!(await superAdminRepository.isUsernameTaken(username))) {
      return { username, available: true, suggestions: [] };
    }

    const candidates = buildUsernameCandidates(username);
    const taken = new Set(await superAdminRepository.findTakenUsernames(candidates));
    const suggestions = candidates.filter((candidate) => !taken.has(candidate)).slice(0, SUGGESTION_COUNT);

    return { username, available: false, suggestions };
  },

  createUser: async ({ username, password, role }: CreateUserInput, creator: AuthUser) => {
    if (role === Role.super_admin && !(await accessService.hasPermission(creator, ACCESS_KEYS.superAdminCreate))) {
      throw ApiError.forbidden('You do not have permission to create super admins');
    }

    if (await superAdminRepository.isUsernameTaken(username)) {
      throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      return await superAdminRepository.createUser({ username, passwordHash, role, createdById: creator.id });
    } catch (err) {
      // Another request took the same username between the check and the insert.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
      }
      throw err;
    }
  },
};
