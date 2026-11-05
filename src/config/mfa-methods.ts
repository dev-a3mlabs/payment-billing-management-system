export const MFA_METHODS = {
  recoveryCode: 'recovery_code',
  totp: 'totp',
} as const;

export type MfaMethod = (typeof MFA_METHODS)[keyof typeof MFA_METHODS];
