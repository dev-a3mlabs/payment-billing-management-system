import type { NextFunction, Request, Response } from 'express';
import { ROLE_PORTAL, type Portal } from '../config/portals.js';
import { UserStatus, type Role } from '../generated/prisma/enums.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/token.js';

export type AuthUser = {
  id: number;
  uuid: string;
  role: Role;
  portal: Portal;
};

// Request on routes behind authenticate(), where user is always set.
export type AuthRequest = Request & { user: AuthUser };

// Verifies the access token and that the user still belongs to this portal.
export const authenticate = (portal: Portal) => async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  if (payload.type !== 'access') {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  if (payload.portal !== portal) {
    throw ApiError.forbidden();
  }

  // The token can be outdated, so check the current role and status in the DB.
  const user = await authRepository.findUserByUuid(payload.sub);
  if (!user || user.status !== UserStatus.active) {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  if (ROLE_PORTAL[user.role] !== portal) {
    throw ApiError.forbidden();
  }

  (req as AuthRequest).user = { id: user.id, uuid: user.uuid, role: user.role, portal };
  next();
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const { user } = req as AuthRequest;
    if (!user || !roles.includes(user.role)) {
      throw ApiError.forbidden();
    }
    next();
  };
