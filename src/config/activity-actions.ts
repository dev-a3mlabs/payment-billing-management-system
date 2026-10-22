export const ACTIVITY_ACTIONS = {
  loginBlocked: 'auth.login.blocked',
  tokenReuseDetected: 'auth.token.reuse_detected',
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
