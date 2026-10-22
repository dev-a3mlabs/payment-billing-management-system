import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const activityLogRepository = {
  create: (data: Prisma.ActivityLogUncheckedCreateInput) => prisma.activityLog.create({ data }),
};
