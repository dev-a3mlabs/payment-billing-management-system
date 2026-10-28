import { Router } from 'express';
import type { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { profileController } from './profile.controller.js';
import { sessionUuidParamsSchema, updateProfileSchema } from './profile.schema.js';

// Profile router for one portal; each role module mounts it at /profile.
export const profileRoutesFor = (portal: Portal) => {
  const router = Router();

  router.patch('/', authenticate(portal), validate({ body: updateProfileSchema }), profileController.updateProfile);
  router.get('/sessions', authenticate(portal), profileController.listSessions);
  router.delete(
    '/sessions/:uuid',
    authenticate(portal),
    validate({ params: sessionUuidParamsSchema }),
    profileController.revokeSession,
  );

  return router;
};
