import { z } from 'zod';
import { passwordSchema } from '../../auth/v1/auth.schema.js';
import { usernameSchema } from '../../super-admin/v1/super-admin.schema.js';

// No role or admin in the body: an admin can only create agents, under themself.
export const createAgentSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
