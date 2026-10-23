import { prisma } from '../../db/prisma.js';

export const superAdminRepository = {
  findTakenUsernames: async (usernames: string[]) =>
    (await prisma.user.findMany({ where: { username: { in: usernames } }, select: { username: true } })).map(
      (user) => user.username,
    ),

};
