export const SECURITY_ALERT_TYPES = {
  failedLoginSpike: 'failed_login_spike',
  impossibleTravel: 'impossible_travel',
  newDevice: 'new_device',
  newLocation: 'new_location',
} as const;

export type SecurityAlertType = (typeof SECURITY_ALERT_TYPES)[keyof typeof SECURITY_ALERT_TYPES];
