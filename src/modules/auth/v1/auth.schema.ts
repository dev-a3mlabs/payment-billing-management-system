import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  eventId: z.string().trim().min(1, 'Event ID is required'),
  IdentityToken: z.string().trim().min(1, 'Identity token is required').optional(),
});

// code is the 6-digit app code or a recovery code; eventId is a new Fingerprint event from the same browser.
export const loginMfaSchema = z.object({
  mfaToken: z.string().trim().min(1, 'MFA token is required'),
  code: z.string().trim().min(1, 'Code is required').max(32, 'Code must be at most 32 characters'),
  eventId: z.string().trim().min(1, 'Event ID is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required'),
});

// Shared by create-user and change-password, so the rules are the same everywhere.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt ignores anything after 72 bytes
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, 'Confirm new password is required'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'New password and confirm new password must match',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginMfaInput = z.infer<typeof loginMfaSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
