import { z } from 'zod';
import { LoginStatus, Role } from '../../../generated/prisma/enums.js';

const MAX_RANGE_DAYS = 366;

const pageSchema = z.coerce.number().int().min(1).default(1);

const dateRangeFields = {
  from: z.coerce.date('From must be a valid date').optional(),
  to: z.coerce.date('To must be a valid date').optional(),
};

// Keeps every report query on a bounded slice of the history, which is kept forever.
const isValidRange = ({ from, to }: { from?: Date; to?: Date }) => {
  const end = to ?? new Date();
  return !from || (from <= end && end.getTime() - from.getTime() <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
};

const rangeError = {
  message: `From must be before To, and the range at most ${MAX_RANGE_DAYS} days`,
  path: ['from'],
};

export const loginReportQuerySchema = z
  .object({
    page: pageSchema,
    ...dateRangeFields,
    userUuid: z.uuid('User UUID must be a valid UUID').optional(),
    role: z.enum([Role.admin, Role.agent], `Role must be one of: ${Role.admin}, ${Role.agent}`).optional(),
    status: z.enum(LoginStatus, `Status must be one of: ${Object.values(LoginStatus).join(', ')}`).optional(),
    countryCode: z.string().trim().toUpperCase().length(2, 'Country code must be 2 letters').optional(),
    ip: z.string().trim().max(45, 'IP must be at most 45 characters').optional(),
    visitorId: z.string().trim().max(64, 'Visitor ID must be at most 64 characters').optional(),
    flagged: z.stringbool('Flagged must be true or false').optional(),
  })
  .refine(isValidRange, rangeError);

export const loginHistoryQuerySchema = z
  .object({
    page: pageSchema,
    ...dateRangeFields,
    status: z.enum(LoginStatus, `Status must be one of: ${Object.values(LoginStatus).join(', ')}`).optional(),
  })
  .refine(isValidRange, rangeError);

export type LoginReportQuery = z.infer<typeof loginReportQuerySchema>;
export type LoginHistoryQuery = z.infer<typeof loginHistoryQuerySchema>;
