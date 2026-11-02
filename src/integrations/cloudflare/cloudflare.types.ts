// What Cloudflare siteverify returns
export interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
  'error-codes': string[];
}

// What the service returns to the login code
export interface TurnstileVerifyResult {
  ok: boolean;
  reason?: string;
  errorCodes?: string[];
}