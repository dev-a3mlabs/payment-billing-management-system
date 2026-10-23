export const SESSION_REVOKE_REASONS = {
  logout: 'logout',
  reuseDetected: 'reuse_detected',
  passwordChanged: 'password_changed',
} as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[keyof typeof SESSION_REVOKE_REASONS];
