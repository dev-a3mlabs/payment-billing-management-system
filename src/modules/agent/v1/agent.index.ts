import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { requireMfaSetup } from '../../../middlewares/require-mfa-setup.middleware.js';
import { requirePasswordChanged } from '../../../middlewares/require-password-changed.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { ownChangeRequestRoutes } from '../../change-request/v1/change-request.index.js';
import notificationRoutes from '../../notification/v1/notification.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.agent));
router.use('/profile', profileRoutesFor(Portal.agent));

// Every route below needs an agent token.
router.use(authenticate(Portal.agent));

// Block normal access until the password is changed
router.use(requirePasswordChanged);

// Block normal access until MFA is set up, when it is required
router.use(requireMfaSetup);

router.use('/profile/change-requests', ownChangeRequestRoutes);
router.use('/notifications', notificationRoutes);

export default router;
