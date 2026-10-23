import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { adminController } from './admin.controller.js';
import { createAgentSchema } from './admin.schema.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.admin));
router.use('/profile', profileRoutesFor(Portal.admin));

// Every route below needs an admin token.
router.use(authenticate(Portal.admin));

router.post('/agents', validate({ body: createAgentSchema }), adminController.createAgent);

export default router;
