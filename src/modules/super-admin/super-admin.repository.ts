import { prisma } from '../../db/prisma.js';
import type { Role } from '../../generated/prisma/enums.js';

export const superAdminRepository = {
  isUsernameTaken: async (username: string) =>
    (await prisma.user.findUnique({ where: { username }, select: { id: true } })) !== null,

  findTakenUsernames: async (usernames: string[]) =>
    (await prisma.user.findMany({ where: { username: { in: usernames } }, select: { username: true } })).map(
      (user) => user.username,
    ),

  createUser: (data: { username: string; passwordHash: string; role: Role; createdById: number }) =>
    prisma.user.create({
      data: { ...data, mustChangePassword: true },
      select: { uuid: true, username: true, role: true, mustChangePassword: true, createdAt: true },
    }),
};
