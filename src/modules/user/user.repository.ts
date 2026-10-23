import { prisma } from '../../db/prisma.js';
import type { Role } from '../../generated/prisma/enums.js';

export const userRepository = {
  isUsernameTaken: async (username: string) =>
    (await prisma.user.findUnique({ where: { username }, select: { id: true } })) !== null,

  findByUuid: (uuid: string) =>
    prisma.user.findUnique({ where: { uuid }, select: { id: true, role: true, status: true } }),

  create: (data: { username: string; passwordHash: string; role: Role; createdById: number; parentId?: number }) =>
    prisma.user.create({
      data: { ...data, mustChangePassword: true },
      select: { uuid: true, username: true, role: true, mustChangePassword: true, createdAt: true },
    }),

  findAllByRole: (role: Role) =>
    prisma.user.findMany({
      where: { role },
      select: { uuid: true, username: true, role: true, status: true, createdAt: true },
    }),
};
