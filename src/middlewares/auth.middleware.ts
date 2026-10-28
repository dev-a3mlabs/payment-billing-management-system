import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '../config/error-codes.js';
import { ROLE_PORTAL, type Portal } from '../config/portals.js';
import type { Role } from '../generated/prisma/enums.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { sessionService } from '../modules/session/session.service.js';
import { userService } from '../modules/user/user.service.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/token.js';

export type AuthUser = {
  id: number;
  uuid: string;
  role: Role;
  portal: Portal;
  sessionId: number;
  mustChangePassword: boolean;
};

// Request on routes behind authenticate(), where user is always set.
export type AuthRequest = Request & { user: AuthUser };

// Verifies the access token, its session, and that the user still belongs to this portal.
export const authenticate = (portal: Portal) => async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token', ERROR_CODES.INVALID_TOKEN);
  }

  if (payload.type !== 'access') {
    throw ApiError.unauthorized('Invalid or expired access token', ERROR_CODES.INVALID_TOKEN);
  }
  if (payload.portal !== portal) {
    throw ApiError.forbidden();
  }

  // The token can outlive a logout or a role change, so check the session and user in the DB.
  const session = await authRepository.findSessionByUuid(payload.sid);
  if (
    !session ||
    !sessionService.isActive(session) ||
    session.user.uuid !== payload.sub ||
    !userService.isActive(session.user)
  ) {
    throw ApiError.unauthorized('Invalid or expired access token', ERROR_CODES.INVALID_TOKEN);
  }

  const { user } = session;
  if (session.portal !== portal || ROLE_PORTAL[user.role] !== portal) {
    throw ApiError.forbidden();
  }

  (req as AuthRequest).user = { 
    id: user.id, 
    uuid: user.uuid, 
    role: user.role, 
    portal, 
    sessionId: session.id,
    mustChangePassword: user.mustChangePassword
  };
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
