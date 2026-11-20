import { z } from 'zod';

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const notificationParamsSchema = z.object({
  id: z.coerce.number().int().positive('Notification ID must be a positive number'),
});
