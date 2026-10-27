import { prisma } from '../../db/prisma.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const activityLogRepository = {
  create: (data: Prisma.ActivityLogUncheckedCreateInput, tx: TxClient = prisma) => tx.activityLog.create({ data }),
};
