import { z } from 'zod';

export const updateProfileSchema = z
  .strictObject({
    firstName: z.string().trim().min(1, 'First name is required').max(50, 'First name must be at most 50 characters'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Last name cannot be empty')
      .max(50, 'Last name must be at most 50 characters')
      .nullable(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(191, 'Email must be at most 191 characters')
      .pipe(z.email('Email must be valid'))
      .nullable(),
    countryCode: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{0,3}$/, 'Country code must look like +91')
      .nullable(),
    mobileNumber: z
      .string()
      .trim()
      .regex(/^\d{6,15}$/, 'Mobile number must be 6 to 15 digits')
      .nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine(
    (data) => ('countryCode' in data) === ('mobileNumber' in data) && (data.countryCode === null) === (data.mobileNumber === null),
    { message: 'Country code and mobile number must be sent together', path: ['mobileNumber'] },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
