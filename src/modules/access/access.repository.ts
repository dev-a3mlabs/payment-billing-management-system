import { prisma } from '../../db/prisma.js';
import type { Role } from '../../generated/prisma/enums.js';

export const accessRepository = {
  findKeyWithValues: (key: string, userId: number, role: Role) =>
    prisma.accessKey.findUnique({
      where: { key },
      include: {
        userValues: { where: { userId } },
        roleValues: { where: { role } },
      },
    }),
};
