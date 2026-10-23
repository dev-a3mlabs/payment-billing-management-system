import bcrypt from 'bcrypt';
import { ERROR_CODES } from '../../config/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import { userRepository } from './user.repository.js';

type CreateUserData = {
  username: string;
  password: string;
  role: Role;
  createdById: number;
  parentId?: number;
};

export const userService = {
  create: async ({ password, ...data }: CreateUserData) => {
    if (await userRepository.isUsernameTaken(data.username)) {
      throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      return await userRepository.create({ ...data, passwordHash });
    } catch (err) {
      // Another request took the same username between the check and the insert.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('Username already taken', ERROR_CODES.USERNAME_TAKEN);
      }
      throw err;
    }
  },
};
