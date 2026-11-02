import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { adminController } from './admin.controller.js';
import { listAgentsQuerySchema, updateUserPermissionsSchema } from '../../super-admin/v1/super-admin.schema.js';
import { agentUuidParamsSchema, changeAgentStatusSchema, createAgentSchema } from './admin.schema.js';
import { requirePasswordChanged } from '../../../middlewares/require-password-changed.middleware.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.admin));
router.use('/profile', profileRoutesFor(Portal.admin));

// Every route below needs an admin token.
router.use(authenticate(Portal.admin));

// Block normal access until the password is changed
router.use(requirePasswordChanged);

router.get('/permissions', adminController.getPermissions);
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
router.patch(
  '/agents/:uuid/status',
  validate({ params: agentUuidParamsSchema, body: changeAgentStatusSchema }),
  adminController.changeAgentStatus,
);

export default router;
