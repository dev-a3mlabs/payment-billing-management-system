import { Router } from 'express';
import { sendSuccess } from '../utils/response.js';
import superAdminRoutes from '../modules/super-admin/v1/super-admin.index.js';
import adminRoutes from '../modules/admin/v1/admin.index.js';
import agentRoutes from '../modules/agent/v1/agent.index.js';

const router = Router();

// Public
router.get('/hello', (_req, res) => {
  sendSuccess(res, { message: 'Hello World' });
});

router.use('/super-admin', superAdminRoutes);
router.use('/admin', adminRoutes);
router.use('/agent', agentRoutes);

export default router;
