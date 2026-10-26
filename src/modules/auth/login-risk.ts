import type { FingerprintEvent } from '../../integrations/fingerprint/fingerprint.types.js';

// failed: the Fingerprint API errored or timed out. event null: Fingerprint doesn't know this eventId.
export type FingerprintLookup = { event: FingerprintEvent | null; failed: boolean };

export type LoginBlock = { reason: string; message: string };

// Messages never name the provider or the exact check; the reason is only stored internally.
export const LOGIN_VERIFICATION_FAILED = 'We could not verify your login. Please refresh the page and try again.';

// Returns why the login must be blocked, or null if it is allowed. Add new rules here.
export const checkLoginRisk = ({ event, failed }: FingerprintLookup): LoginBlock | null => {
  if (failed) {
    return {
      reason: 'fingerprint_unavailable',
      message: 'We could not complete your login right now. Please try again later.',
    };
  }

  // A real browser always sends a valid event, so a missing one means the request was tampered with.
  if (!event) {
    return { reason: 'event_not_found', message: LOGIN_VERIFICATION_FAILED };
  }


  // 'good' bots (e.g. search crawlers) are still automation and have no reason to log in.
  if (event.bot && event.bot !== 'not_detected') {
    return { reason: 'bot', message: LOGIN_VERIFICATION_FAILED };
  }

  if (event.vpn === true) {
    return {
      reason: 'vpn',
      message: 'Login through a VPN is not allowed. Please turn off your VPN and try again.',
    };
  }

  if (event.incognito === true) {
    return {
      reason: 'incognito',
      message: 'Login from a private or incognito window is not allowed. Please use a normal browser window.',
    };
  }

  return null;
};
