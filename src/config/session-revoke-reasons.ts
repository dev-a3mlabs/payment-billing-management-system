export const SESSION_REVOKE_REASONS = {
  logout: 'logout',
  reuseDetected: 'reuse_detected',
} as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[keyof typeof SESSION_REVOKE_REASONS];
