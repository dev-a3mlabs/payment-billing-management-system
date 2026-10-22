import { prisma } from '../../db/prisma.js';
import type { Role } from '../../generated/prisma/enums.js';

export const superAdminRepository = {
  findUserByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),

  createUser: (data: { username: string; passwordHash: string; role: Role; createdById: number }) =>
    prisma.user.create({
      data: { ...data, mustChangePassword: true },
      select: { uuid: true, username: true, role: true, mustChangePassword: true, createdAt: true },
    }),
};
