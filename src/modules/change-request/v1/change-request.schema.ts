import { z } from 'zod';
import { CHANGE_REQUEST_FIELDS } from '../../../config/change-request-fields.js';
import { ChangeRequestStatus } from '../../../generated/prisma/enums.js';
import { countryCodeSchema, emailSchema, mobileNumberSchema } from '../../profile/v1/profile.schema.js';
import { usernameSchema } from '../../super-admin/v1/super-admin.schema.js';

// A pending request past its expiry date; never stored, worked out when read.
export const CHANGE_REQUEST_EXPIRED = 'expired';

const CHANGE_REQUEST_STATUSES = [...Object.values(ChangeRequestStatus), CHANGE_REQUEST_EXPIRED] as const;

export const createChangeRequestSchema = z.discriminatedUnion(
  'field',
  [
    z.object({
      field: z.literal(CHANGE_REQUEST_FIELDS.email),
      newValue: z.strictObject({ email: emailSchema }),
    }),
    z.object({
      field: z.literal(CHANGE_REQUEST_FIELDS.mobile),
      newValue: z.strictObject({ countryCode: countryCodeSchema, mobileNumber: mobileNumberSchema }),
    }),
    z.object({
      field: z.literal(CHANGE_REQUEST_FIELDS.username),
      newValue: z.strictObject({ username: usernameSchema }),
    }),
  ],
  { error: `Field must be one of: ${Object.values(CHANGE_REQUEST_FIELDS).join(', ')}` },
);

export const rejectChangeRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500, 'Reason must be at most 500 characters'),
});

export const changeRequestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(CHANGE_REQUEST_STATUSES, `Status must be one of: ${CHANGE_REQUEST_STATUSES.join(', ')}`).optional(),
});

export const changeRequestParamsSchema = z.object({
  uuid: z.uuid('Change request UUID must be a valid UUID'),
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export type ChangeRequestQuery = z.infer<typeof changeRequestQuerySchema>;
