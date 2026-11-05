import { Router } from 'express';
import type { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { loginReportController } from '../../login-report/v1/login-report.controller.js';
import { loginHistoryQuerySchema } from '../../login-report/v1/login-report.schema.js';
import { securityAlertController } from '../../security-alert/v1/security-alert.controller.js';
import { ownSecurityAlertQuerySchema } from '../../security-alert/v1/security-alert.schema.js';
import { profileController } from './profile.controller.js';
import { disableMfaSchema, enableMfaSchema, sessionUuidParamsSchema, updateProfileSchema } from './profile.schema.js';

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
  router.get(
    '/login-history',
    authenticate(portal),
    validate({ query: loginHistoryQuerySchema }),
    loginReportController.ownHistory,
  );
  router.get(
    '/security-alerts',
    authenticate(portal),
    validate({ query: ownSecurityAlertQuerySchema }),
    securityAlertController.ownList,
  );
  router.get('/mfa', authenticate(portal), profileController.getMfa);
  router.post('/mfa/setup', authenticate(portal), profileController.setupMfa);
  router.post('/mfa/enable', authenticate(portal), validate({ body: enableMfaSchema }), profileController.enableMfa);
  router.post('/mfa/disable', authenticate(portal), validate({ body: disableMfaSchema }), profileController.disableMfa);

  return router;
};
