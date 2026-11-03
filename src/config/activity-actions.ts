export const ACTIVITY_ACTIONS = {
  accessGrantChange: 'access.grant.change',
  accessValueUnlock: 'access.value.unlock',
  accessValueUpdate: 'access.value.update',
  accountLocked: 'auth.account.locked',
  accountUnlocked: 'auth.account.unlocked',
  tokenReuseDetected: 'auth.token.reuse_detected',
  passwordChange: 'user.password.change',
  profileUpdate: 'user.profile.update',
  statusChange: 'user.status.change',
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
