import type { ActivityAction } from '../../config/activity-actions.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActivityStatus } from '../../generated/prisma/enums.js';
import type { ClientInfo } from '../../utils/request.js';
import { activityLogRepository } from './activity-log.repository.js';

type ActivityEntry = {
  action: ActivityAction;
  status: ActivityStatus;
  actorId?: number;
  targetUserId?: number;
  sessionId?: number;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

export const activityLogService = {
  record: (entry: ActivityEntry, client: ClientInfo, tx?: TxClient) =>
    activityLogRepository.create({ ...entry, ...client }, tx),
};
