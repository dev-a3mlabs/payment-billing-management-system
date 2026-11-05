import type { RequestHandler } from 'express';
import { ERROR_CODES } from '../config/error-codes.js';
import { mfaService } from '../modules/mfa/mfa.service.js';
import { ApiError } from '../utils/ApiError.js';
import type { AuthRequest } from './auth.middleware.js';

// Checked on every request, so turning the policy on takes effect without a new login.
export const requireMfaSetup: RequestHandler = async (req, _res, next) => {
  const { user } = req as AuthRequest;

  if (!(await mfaService.isEnabled(user.id)) && (await mfaService.isRequired(user))) {
    throw ApiError.forbidden('You must set up MFA before accessing this resource.', ERROR_CODES.MFA_SETUP_REQUIRED);
  }

  next();
};
