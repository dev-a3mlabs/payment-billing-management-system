import { z } from 'zod';
import { Role, UserStatus } from '../../../generated/prisma/enums.js';
import { passwordSchema } from '../../auth/v1/auth.schema.js';
import { countryCodeSchema, emailSchema, mobileNumberSchema } from '../../profile/v1/profile.schema.js';

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

export const userSessionParamsSchema = userUuidParamsSchema.extend({
  sessionUuid: z.uuid('Session UUID must be a valid UUID'),
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

// Replaces the admin's whole set of grants; an empty array removes them all.
export const updateUserGrantsSchema = z.object({
  keys: z
    .array(z.string().min(1, 'Permission key is required'), 'Keys must be an array of permission keys')
    .refine((keys) => new Set(keys).size === keys.length, 'Keys must be unique'),
});

export const changeUserStatusSchema = z.object({
  status: z.enum([UserStatus.active, UserStatus.inactive, UserStatus.suspended], {
    error: `Status must be one of: ${UserStatus.active}, ${UserStatus.inactive}, ${UserStatus.suspended}`,
  }),
});


// The super admin's own username, email and mobile; there is no one above to approve a request.
export const updateAccountSchema = z
  .strictObject({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    mobileNumber: mobileNumberSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine((data) => ('countryCode' in data) === ('mobileNumber' in data), {
    message: 'Country code and mobile number must be sent together',
    path: ['mobileNumber'],
  });

export const listAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
export type UpdateUserGrantsInput = z.infer<typeof updateUserGrantsSchema>;
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;