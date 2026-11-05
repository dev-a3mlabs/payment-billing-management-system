export const LOGIN_BLOCK_REASONS = {
  accountLocked: 'account_locked',
  bot: 'bot',
  deviceLimit: 'device_limit',
  deviceMismatch: 'device_mismatch',
  eventNotFound: 'event_not_found',
  fingerprintUnavailable: 'fingerprint_unavailable',
  incognito: 'incognito',
  lowConfidence: 'low_confidence',
  unknownUser: 'unknown_user',
  vpn: 'vpn',
  wrongMfaCode: 'wrong_mfa_code',
  wrongPassword: 'wrong_password',
} as const;
