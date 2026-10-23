import { z } from 'zod';
import { Role } from '../../../generated/prisma/enums.js';
import { passwordSchema } from '../../auth/v1/auth.schema.js';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z]/, 'Username must start with a lowercase letter')
  .regex(/^[a-z0-9_.]+$/, 'Username can only contain lowercase letters, numbers, underscore and dot')
  .regex(/[^.]$/, 'Username cannot end with a dot');

export const checkUsernameSchema = z.object({
  username: usernameSchema,
});

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum([Role.super_admin, Role.admin, Role.agent], {
    error: `Role must be one of: ${Role.super_admin}, ${Role.admin}, ${Role.agent}`,
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
