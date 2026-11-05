import { Secret, TOTP } from 'otpauth';

// Shown above the code in the authenticator app.
const ISSUER = 'Payment Billing';
const PERIOD_SECONDS = 30;

const buildTotp = (secret: string, username = '') =>
  new TOTP({ issuer: ISSUER, label: username, secret: Secret.fromBase32(secret), period: PERIOD_SECONDS });

export const createTotpSecret = () => new Secret({ size: 20 }).base32;

// The otpauth:// link the QR code holds.
export const totpUri = (secret: string, username: string) => buildTotp(secret, username).toString();

// Returns the time step the code belongs to, or null. One step either side allows for phone clock drift.
export const matchTotp = (secret: string, code: string) => {
  const delta = buildTotp(secret).validate({ token: code, window: 1 });
  return delta === null ? null : Math.floor(Date.now() / 1000 / PERIOD_SECONDS) + delta;
};
