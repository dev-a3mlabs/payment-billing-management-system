import { randomInt } from 'node:crypto';

// Look-alike characters (0/O, 1/l/I) are left out so the password is easy to read out and type.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SPECIAL = '@#$%&*!?';
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

const pick = (chars: string) => chars[randomInt(chars.length)];

// Always includes a lowercase, uppercase, digit and special character, so it passes the password rules.
export const generateTempPassword = (length = 12) => {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates shuffle, so the required characters aren't always at the start.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};
