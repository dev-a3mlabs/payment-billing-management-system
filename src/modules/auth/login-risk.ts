import { LOGIN_BLOCK_REASONS } from '../../config/login-block-reasons.js';
import type { FingerprintEvent } from '../../integrations/fingerprint/fingerprint.types.js';
import { logger } from '../../utils/logger.js';

// failed: the Fingerprint API errored or timed out. event null: Fingerprint doesn't know this eventId.
export type FingerprintLookup = { event: FingerprintEvent | null; failed: boolean };

export type LoginBlock = { reason: string; message: string };

// Messages never name the provider or the exact check; the reason is only stored internally.
export const LOGIN_VERIFICATION_FAILED = 'We could not verify your login. Please refresh the page and try again.';

const MIN_CONFIDENCE_SCORE = 0.9;

// Returns why the login must be blocked, or null if it is allowed. Add new rules here.
export const checkLoginRisk = ({ event, failed }: FingerprintLookup): LoginBlock | null => {
  if (failed) {
    return {
      reason: LOGIN_BLOCK_REASONS.fingerprintUnavailable,
      message: 'We could not complete your login right now. Please try again later.',
    };
  }

  // A real browser always sends a valid event, so a missing one means the request was tampered with.
  if (!event) {
    return { reason: LOGIN_BLOCK_REASONS.eventNotFound, message: LOGIN_VERIFICATION_FAILED };
  }

  // A low score means the device may be confused with another one, which would break device limits.
  if (event.identification.confidence.score < MIN_CONFIDENCE_SCORE) {
    return { reason: LOGIN_BLOCK_REASONS.lowConfidence, message: LOGIN_VERIFICATION_FAILED };
  }

  // 'good' bots (e.g. search crawlers) are still automation and have no reason to log in.
  if (event.bot && event.bot !== 'not_detected') {
    return { reason: LOGIN_BLOCK_REASONS.bot, message: LOGIN_VERIFICATION_FAILED };
  }

  // if (event.vpn === true) {
  //   logger.warn('Login attempt through a VPN was blocked.', event);
  //   return {
  //     reason: LOGIN_BLOCK_REASONS.vpn,
  //     message: 'Login through a VPN is not allowed. Please turn off your VPN and try again.',
  //   };
  // }

  if (event.incognito === true) {
    return {
      reason: LOGIN_BLOCK_REASONS.incognito,
      message: 'Login from a private or incognito window is not allowed. Please use a normal browser window.',
    };
  }

  return null;
};
