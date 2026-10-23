export const ACTIVITY_ACTIONS = {
  tokenReuseDetected: 'auth.token.reuse_detected',
  passwordChange: 'user.password.change',
  profileUpdate: 'user.profile.update',
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
