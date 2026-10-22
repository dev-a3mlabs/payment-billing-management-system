import { z } from 'zod';
import { Role } from '../../../generated/prisma/enums.js';

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_.]+$/, 'Username can only contain letters, numbers, underscore and dot'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters') // bcrypt ignores anything after 72 bytes
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
  role: z.enum([Role.super_admin, Role.admin, Role.agent], {
    error: `Role must be one of: ${Role.super_admin}, ${Role.admin}, ${Role.agent}`,
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
