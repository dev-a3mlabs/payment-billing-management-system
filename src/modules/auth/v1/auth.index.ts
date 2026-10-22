import { Router } from 'express';
import type { Portal } from '../../../config/portals.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { loginFor, logout, refreshFor } from './auth.controller.js';
import { loginSchema, refreshTokenSchema } from './auth.schema.js';

// Auth router for one portal; each role module mounts it at /auth.
export const authRoutesFor = (portal: Portal) => {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), loginFor(portal));
  router.post('/refresh', validate({ body: refreshTokenSchema }), refreshFor(portal));
  router.post('/logout', validate({ body: refreshTokenSchema }), logout);

  return router;
};
