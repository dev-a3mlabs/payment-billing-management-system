import { z } from 'zod';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { passwordSchema } from '../../auth/v1/auth.schema.js';
import { usernameSchema } from '../../super-admin/v1/super-admin.schema.js';

// No role or admin in the body: an admin can only create agents, under themself.
export const createAgentSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const agentUuidParamsSchema = z.object({
  uuid: z.uuid('Agent UUID must be a valid UUID'),
});

export const changeAgentStatusSchema = z.object({
  status: z.enum([UserStatus.active, UserStatus.inactive], {
    error: `Status must be one of: ${UserStatus.active}, ${UserStatus.inactive}`,
  }),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type ChangeAgentStatusInput = z.infer<typeof changeAgentStatusSchema>;
