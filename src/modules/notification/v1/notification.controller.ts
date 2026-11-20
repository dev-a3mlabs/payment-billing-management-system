import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middlewares/auth.middleware.js';
import { ApiError } from '../../../utils/ApiError.js';
import { sendSuccess } from '../../../utils/response.js';
import { sessionService } from '../../session/session.service.js';
import { notificationEvents } from '../notification.events.js';
import { notificationService } from '../notification.service.js';

const MAX_STREAMS_PER_USER = 5;
const HEARTBEAT_MS = 25 * 1000;
const SESSION_CHECK_MS = 60 * 1000;

export const notificationController = {
  list: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const { page } = req.query as unknown as { page: number };
    const data = await notificationService.list(user.id, page);

    sendSuccess(res, { message: 'Notifications retrieved successfully', data });
  },

  markRead: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    const { id } = req.params as unknown as { id: number };
    await notificationService.markRead(user.id, id);

    sendSuccess(res, { message: 'Notification marked as read' });
  },

  markAllRead: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    await notificationService.markAllRead(user.id);

    sendSuccess(res, { message: 'All notifications marked as read' });
  },

  // Server-Sent Events: stays open and pushes each new notification as it is saved.
  stream: async (req: Request, res: Response) => {
    const { user } = req as AuthRequest;
    if (notificationEvents.openStreams(user.id) >= MAX_STREAMS_PER_USER) {
      throw ApiError.tooManyRequests('Too many open connections');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const write = (chunk: string) => {
      if (!res.writableEnded) res.write(chunk);
    };
    const send = (notification: unknown) => {
      const { id } = notification as { id: number };
      write(`id: ${id}\nevent: notification\ndata: ${JSON.stringify(notification)}\n\n`);
    };

    write('retry: 5000\n\n');
    const unsubscribe = notificationEvents.subscribe(user.id, send);
    const heartbeat = setInterval(() => write(': keep-alive\n\n'), HEARTBEAT_MS);
    const sessionCheck = setInterval(() => {
      sessionService
        .isStillValid(user.sessionId)
        .then((valid) => valid || res.end())
        .catch(() => res.end());
    }, SESSION_CHECK_MS);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
      clearInterval(sessionCheck);
    });

    const lastId = Number(req.get('last-event-id'));
    if (Number.isInteger(lastId) && lastId > 0) {
      (await notificationService.listMissed(user.id, lastId)).forEach(send);
    }
  },
};
