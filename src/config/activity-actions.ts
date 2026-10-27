export const ACTIVITY_ACTIONS = {
  accountLocked: 'auth.account.locked',
  accountUnlocked: 'auth.account.unlocked',
  tokenReuseDetected: 'auth.token.reuse_detected',
  passwordChange: 'user.password.change',
  profileUpdate: 'user.profile.update',
  statusChange: 'user.status.change',
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
