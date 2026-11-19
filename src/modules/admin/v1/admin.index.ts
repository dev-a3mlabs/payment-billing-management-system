import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { loginReportController } from '../../login-report/v1/login-report.controller.js';
import { loginReportQuerySchema } from '../../login-report/v1/login-report.schema.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { securityAlertController } from '../../security-alert/v1/security-alert.controller.js';
import { securityAlertParamsSchema, securityAlertQuerySchema } from '../../security-alert/v1/security-alert.schema.js';
import { adminController } from './admin.controller.js';
import { listAgentsQuerySchema, updateUserPermissionsSchema } from '../../super-admin/v1/super-admin.schema.js';
import {
  agentSessionParamsSchema,
  agentUuidParamsSchema,
  changeAgentStatusSchema,
  createAgentSchema,
} from './admin.schema.js';
import { requirePasswordChanged } from '../../../middlewares/require-password-changed.middleware.js';
import { requireMfaSetup } from '../../../middlewares/require-mfa-setup.middleware.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.admin));
router.use('/profile', profileRoutesFor(Portal.admin));

// Every route below needs an admin token.
router.use(authenticate(Portal.admin));

// Block normal access until the password is changed
router.use(requirePasswordChanged);

// Block normal access until MFA is set up, when it is required
router.use(requireMfaSetup);

router.get('/permissions', adminController.getPermissions);
router.get('/permissions/me', adminController.getOwnPermissions);
router.get('/agents', validate({ query: listAgentsQuerySchema }), adminController.getAgents);
router.post('/agents', validate({ body: createAgentSchema }), adminController.createAgent);
router.get('/agents/quota', adminController.getAgentQuota);
router.get('/agents/:uuid/permissions', validate({ params: agentUuidParamsSchema }), adminController.getAgentPermissions);
router.put(
  '/agents/:uuid/permissions',
  validate({ params: agentUuidParamsSchema, body: updateUserPermissionsSchema }),
  adminController.updateAgentPermissions,
);
router.get('/agents/:uuid/sessions', validate({ params: agentUuidParamsSchema }), adminController.getAgentSessions);
router.delete('/agents/:uuid/sessions', validate({ params: agentUuidParamsSchema }), adminController.revokeAgentSessions);
router.delete(
  '/agents/:uuid/sessions/:sessionUuid',
  validate({ params: agentSessionParamsSchema }),
  adminController.revokeAgentSession,
);
router.patch(
  '/agents/:uuid/status',
  validate({ params: agentUuidParamsSchema, body: changeAgentStatusSchema }),
  adminController.changeAgentStatus,
);
router.delete('/agents/:uuid', validate({ params: agentUuidParamsSchema }), adminController.deleteAgent);
router.get('/login-reports', validate({ query: loginReportQuerySchema }), loginReportController.list);
router.get('/login-reports/summary', validate({ query: loginReportQuerySchema }), loginReportController.summary);
router.get('/login-reports/export', validate({ query: loginReportQuerySchema }), loginReportController.exportCsv);
router.get('/security-alerts', validate({ query: securityAlertQuerySchema }), securityAlertController.list);
router.patch(
  '/security-alerts/:id/resolve',
  validate({ params: securityAlertParamsSchema }),
  securityAlertController.resolve,
);
router.get('/agents/:uuid/mfa', validate({ params: agentUuidParamsSchema }), adminController.getAgentMfa);
router.delete('/agents/:uuid/mfa', validate({ params: agentUuidParamsSchema }), adminController.resetAgentMfa);

export default router;
