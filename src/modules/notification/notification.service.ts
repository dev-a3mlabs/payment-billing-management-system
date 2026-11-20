import type { NotificationType } from '../../config/notification-types.js';
import type { TxClient } from '../../db/transaction.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../utils/ApiError.js';
import { notificationEvents } from './notification.events.js';
import { notificationRepository } from './notification.repository.js';

const PAGE_SIZE = 20;
const MISSED_LIMIT = 100;

type Notification = Awaited<ReturnType<typeof notificationRepository.create>>;

const toResponse = ({ userId: _userId, ...notification }: Notification) => notification;

export const notificationService = {
  // Saves one notification per user; call publish with the result after the transaction commits.
  create: (
    userIds: number[],
    data: { type: NotificationType; entityId: string; metadata: Prisma.InputJsonObject },
    tx: TxClient,
  ) => Promise.all(userIds.map((userId) => notificationRepository.create({ userId, ...data }, tx))),

  publish: (notifications: Notification[]) => {
    for (const notification of notifications) {
      notificationEvents.publish(notification.userId, toResponse(notification));
    }
  },

  list: async (userId: number, page: number) => {
    const [notifications, total, unreadCount] = await Promise.all([
      notificationRepository.findPage(userId, page, PAGE_SIZE),
      notificationRepository.count({ userId }),
      notificationRepository.count({ userId, readAt: null }),
    ]);

    return {
      items: notifications.map(toResponse),
      unreadCount,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    };
  },

  // Notifications saved after lastId, for a stream that reconnects.
  listMissed: async (userId: number, lastId: number) =>
    (await notificationRepository.findAfter(userId, lastId, MISSED_LIMIT)).map(toResponse),

  markRead: async (userId: number, id: number) => {
    if (!(await notificationRepository.exists(userId, id))) {
      throw ApiError.notFound('Notification not found');
    }
    await notificationRepository.markRead({ id, userId });
  },

  markAllRead: (userId: number) => notificationRepository.markRead({ userId }),
};
