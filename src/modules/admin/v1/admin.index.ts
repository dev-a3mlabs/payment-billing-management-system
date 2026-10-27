import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { adminController } from './admin.controller.js';
import { updateUserPermissionsSchema } from '../../super-admin/v1/super-admin.schema.js';
import { agentUuidParamsSchema, changeAgentStatusSchema, createAgentSchema } from './admin.schema.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.admin));
router.use('/profile', profileRoutesFor(Portal.admin));

// Every route below needs an admin token.
router.use(authenticate(Portal.admin));

router.get('/permissions', adminController.getPermissions);
router.post('/agents', validate({ body: createAgentSchema }), adminController.createAgent);
router.get('/agents/quota', adminController.getAgentQuota);
router.get('/agents/:uuid/permissions', validate({ params: agentUuidParamsSchema }), adminController.getAgentPermissions);
router.put(
  '/agents/:uuid/permissions',
  validate({ params: agentUuidParamsSchema, body: updateUserPermissionsSchema }),
  adminController.updateAgentPermissions,
);
router.patch(
  '/agents/:uuid/status',
  validate({ params: agentUuidParamsSchema, body: changeAgentStatusSchema }),
  adminController.changeAgentStatus,
);

export default router;
