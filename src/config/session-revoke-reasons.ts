export const SESSION_REVOKE_REASONS = {
  logout: 'logout',
  reuseDetected: 'reuse_detected',
  passwordChanged: 'password_changed',
  accountInactive: 'account_inactive',
  accountSuspended: 'account_suspended',
  accountDeleted: 'account_deleted',
  sameDeviceLogin: 'same_device_login',
  revokedByUser: 'revoked_by_user',
  revokedByAdmin: 'revoked_by_admin',
  mfaEnabled: 'mfa_enabled',
  mfaReset: 'mfa_reset',
} as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[keyof typeof SESSION_REVOKE_REASONS];
