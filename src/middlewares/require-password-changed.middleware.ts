import type { RequestHandler } from 'express';
import { ERROR_CODES } from '../config/error-codes.js';
import { ApiError } from '../utils/ApiError.js';
import type { AuthRequest } from './auth.middleware.js';

export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  const authReq = req as AuthRequest;

  if (authReq.user.mustChangePassword) {
    return next(
      ApiError.forbidden(
        'You must change your password before accessing this resource.',
        ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      ),
    );
  }

  next();
};