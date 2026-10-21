import { Router } from 'express';
import { validate } from '../../../middlewares/validate.middleware.js';
import { loginFor } from './auth.controller.js';
import { loginSchema } from './auth.schema.js';
import type { Portal } from '../../../config/portals.js';

// Login router for one portal; each role module mounts it at /auth.
export const authRoutesFor = (portal: Portal) => {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), loginFor(portal));

  return router;
};
