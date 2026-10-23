import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { superAdminController } from './super-admin.controller.js';
import { checkUsernameSchema, createUserSchema } from './super-admin.schema.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.super_admin));
router.use('/profile', profileRoutesFor(Portal.super_admin));

// Every route below needs a super admin token.
router.use(authenticate(Portal.super_admin));

router.get('/users/check-username', validate({ query: checkUsernameSchema }), superAdminController.checkUsername);
router.post('/users', validate({ body: createUserSchema }), superAdminController.createUser);
router.get('/temp-password', superAdminController.generateTempPassword);

export default router;
