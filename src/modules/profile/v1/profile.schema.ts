import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(191, 'Email must be at most 191 characters')
  .pipe(z.email('Email must be valid'));

export const countryCodeSchema = z.string().trim().regex(/^\+[1-9]\d{0,3}$/, 'Country code must look like +91');

export const mobileNumberSchema = z.string().trim().regex(/^\d{6,15}$/, 'Mobile number must be 6 to 15 digits');

// Username, email and mobile change through a change request (or /super-admin/profile/account).
export const updateProfileSchema = z
  .strictObject({
    firstName: z.string().trim().min(1, 'First name is required').max(50, 'First name must be at most 50 characters'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Last name cannot be empty')
      .max(50, 'Last name must be at most 50 characters')
      .nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const sessionUuidParamsSchema = z.object({
  uuid: z.uuid('Session UUID must be a valid UUID'),
});

export const enableMfaSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

// code is the 6-digit app code or a recovery code.
export const disableMfaSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: z.string().trim().min(1, 'Code is required').max(32, 'Code must be at most 32 characters'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DisableMfaInput = z.infer<typeof disableMfaSchema>;
