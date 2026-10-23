import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.admin));
router.use('/profile', profileRoutesFor(Portal.admin));

export default router;
