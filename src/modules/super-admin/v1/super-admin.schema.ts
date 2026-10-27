import { z } from 'zod';
import { Role, UserStatus } from '../../../generated/prisma/enums.js';
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

const createUserBaseSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const createUserSchema = z.discriminatedUnion(
  'role',
  [
    createUserBaseSchema.extend({
      role: z.literal(Role.agent),
      adminUuid: z.uuid('Admin UUID must be a valid UUID'),
    }),
    createUserBaseSchema.extend({
      role: z.literal(Role.admin),
    }),
  ],
  { error: `Role must be one of: ${Role.admin}, ${Role.agent}` },
);

export const userUuidParamsSchema = z.object({
  uuid: z.uuid('User UUID must be a valid UUID'),
});

export const userPermissionParamsSchema = userUuidParamsSchema.extend({
  key: z.string().min(1, 'Permission key is required'),
});

// Each value is checked against its key's definition in the access service.
export const updateUserPermissionsSchema = z.object({
  values: z
    .record(z.string(), z.unknown(), 'Values must be an object of permission keys')
    .refine((values) => Object.keys(values).length > 0, 'At least one permission is required'),
});

export const changeUserStatusSchema = z.object({
  status: z.enum([UserStatus.active, UserStatus.inactive, UserStatus.suspended], {
    error: `Status must be one of: ${UserStatus.active}, ${UserStatus.inactive}, ${UserStatus.suspended}`,
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;
