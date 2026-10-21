import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.super_admin));

export default router;
