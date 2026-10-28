import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { superAdminController } from './super-admin.controller.js';
import {
  changeUserStatusSchema,
  checkUsernameSchema,
  createUserSchema,
  updateUserPermissionsSchema,
  userPermissionParamsSchema,
  userUuidParamsSchema,
} from './super-admin.schema.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.super_admin));
router.use('/profile', profileRoutesFor(Portal.super_admin));

// Every route below needs a super admin token.
router.use(authenticate(Portal.super_admin));

router.get('/users/check-username', validate({ query: checkUsernameSchema }), superAdminController.checkUsername);
router.post('/users', validate({ body: createUserSchema }), superAdminController.createUser);
router.get('/temp-password', superAdminController.generateTempPassword);
router.get('/admins', superAdminController.listAdmins);
router.get('/permissions', superAdminController.listPermissions);
router.get('/users/:uuid/permissions', validate({ params: userUuidParamsSchema }), superAdminController.getUserPermissions);
router.put(
  '/users/:uuid/permissions',
  validate({ params: userUuidParamsSchema, body: updateUserPermissionsSchema }),
  superAdminController.updateUserPermissions,
);
router.delete(
  '/users/:uuid/permissions/:key',
  validate({ params: userPermissionParamsSchema }),
  superAdminController.resetUserPermission,
);
router.patch(
  '/users/:uuid/status',
  validate({ params: userUuidParamsSchema, body: changeUserStatusSchema }),
  superAdminController.changeUserStatus,
);
router.get('/users/:uuid/sessions', validate({ params: userUuidParamsSchema }), superAdminController.getUserSessions);
router.delete('/users/:uuid/sessions', validate({ params: userUuidParamsSchema }), superAdminController.revokeUserSessions);
router.post('/users/:uuid/unlock', validate({ params: userUuidParamsSchema }), superAdminController.unlockUser);
router.delete('/users/:uuid', validate({ params: userUuidParamsSchema }), superAdminController.deleteUser);

export default router;
