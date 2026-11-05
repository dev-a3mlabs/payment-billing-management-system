import { z } from 'zod';
import { SECURITY_ALERT_TYPES } from '../../../config/security-alert-types.js';

export const securityAlertQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  userUuid: z.uuid('User UUID must be a valid UUID').optional(),
  type: z
    .enum(SECURITY_ALERT_TYPES, `Type must be one of: ${Object.values(SECURITY_ALERT_TYPES).join(', ')}`)
    .optional(),
  resolved: z.stringbool('Resolved must be true or false').optional(),
});

// A user's own alerts, so there is no user to filter by.
export const ownSecurityAlertQuerySchema = securityAlertQuerySchema.omit({ userUuid: true });

export const securityAlertParamsSchema = z.object({
  id: z.coerce.number().int().positive('Alert ID must be a positive number'),
});

export type SecurityAlertQuery = z.infer<typeof securityAlertQuerySchema>;
