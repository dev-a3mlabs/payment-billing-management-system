import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Portal } from '../config/portals.js';
import type { Role } from '../generated/prisma/enums.js';

export type AccessTokenPayload = {
  sub: string; // user uuid
  role: Role;
  portal: Portal;
  type: 'access';
};

export type TempTokenPayload = {
  sub: string; // user uuid
  portal: Portal;
  type: 'password_change';
};

export const signAccessToken = (payload: Omit<AccessTokenPayload, 'type'>) =>
  jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });

// Only allows changing the password; signed with a different secret so it can never pass as an access token.
export const signTempToken = (payload: Omit<TempTokenPayload, 'type'>) =>
  jwt.sign({ ...payload, type: 'password_change' }, env.JWT_TEMP_SECRET, {
    expiresIn: env.JWT_TEMP_EXPIRES_IN as SignOptions['expiresIn'],
  });
