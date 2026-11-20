import { Router } from 'express';
import { Portal } from '../../../config/portals.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { requireMfaSetup } from '../../../middlewares/require-mfa-setup.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authRoutesFor } from '../../auth/v1/auth.index.js';
import { reviewChangeRequestRoutes } from '../../change-request/v1/change-request.index.js';
import notificationRoutes from '../../notification/v1/notification.index.js';
import { loginReportController } from '../../login-report/v1/login-report.controller.js';
import { loginReportQuerySchema } from '../../login-report/v1/login-report.schema.js';
import { profileRoutesFor } from '../../profile/v1/profile.index.js';
import { securityAlertController } from '../../security-alert/v1/security-alert.controller.js';
import { securityAlertParamsSchema, securityAlertQuerySchema } from '../../security-alert/v1/security-alert.schema.js';
import { superAdminController } from './super-admin.controller.js';
import {
  changeUserStatusSchema,
  checkUsernameSchema,
  createUserSchema,
  listAgentsQuerySchema,
  updateAccountSchema,
  updateUserGrantsSchema,
  updateUserPermissionsSchema,
  userPermissionParamsSchema,
  userSessionParamsSchema,
  userUuidParamsSchema,
} from './super-admin.schema.js';

const router = Router();

router.use('/auth', authRoutesFor(Portal.super_admin));
router.use('/profile', profileRoutesFor(Portal.super_admin));

// Every route below needs a super admin token.
router.use(authenticate(Portal.super_admin));

// Block normal access until MFA is set up
router.use(requireMfaSetup);

router.get('/users/check-username', validate({ query: checkUsernameSchema }), superAdminController.checkUsername);
router.post('/users', validate({ body: createUserSchema }), superAdminController.createUser);
router.get('/temp-password', superAdminController.generateTempPassword);
router.get('/admins', superAdminController.listAdmins);
router.get('/:uuid/agents', validate({ params: userUuidParamsSchema, query: listAgentsQuerySchema }), superAdminController.listAdminAgents);
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
router.delete(
  '/users/:uuid/permissions/:key/lock',
  validate({ params: userPermissionParamsSchema }),
  superAdminController.unlockUserPermission,
);
router.get('/users/:uuid/grants', validate({ params: userUuidParamsSchema }), superAdminController.getUserGrants);
router.put(
  '/users/:uuid/grants',
  validate({ params: userUuidParamsSchema, body: updateUserGrantsSchema }),
  superAdminController.updateUserGrants,
);
router.patch(
  '/users/:uuid/status',
  validate({ params: userUuidParamsSchema, body: changeUserStatusSchema }),
  superAdminController.changeUserStatus,
);
router.get('/users/:uuid/sessions', validate({ params: userUuidParamsSchema }), superAdminController.getUserSessions);
router.delete('/users/:uuid/sessions', validate({ params: userUuidParamsSchema }), superAdminController.revokeUserSessions);
router.delete(
  '/users/:uuid/sessions/:sessionUuid',
  validate({ params: userSessionParamsSchema }),
  superAdminController.revokeUserSession,
);
router.post('/users/:uuid/unlock', validate({ params: userUuidParamsSchema }), superAdminController.unlockUser);
router.get('/login-reports', validate({ query: loginReportQuerySchema }), loginReportController.list);
router.get('/login-reports/summary', validate({ query: loginReportQuerySchema }), loginReportController.summary);
router.get('/login-reports/export', validate({ query: loginReportQuerySchema }), loginReportController.exportCsv);
router.get('/security-alerts', validate({ query: securityAlertQuerySchema }), securityAlertController.list);
router.patch(
  '/security-alerts/:id/resolve',
  validate({ params: securityAlertParamsSchema }),
  securityAlertController.resolve,
);
router.patch('/profile/account', validate({ body: updateAccountSchema }), superAdminController.updateAccount);
router.use('/change-requests', reviewChangeRequestRoutes);
router.use('/notifications', notificationRoutes);
router.get('/users/:uuid/mfa', validate({ params: userUuidParamsSchema }), superAdminController.getUserMfa);
router.delete('/users/:uuid/mfa', validate({ params: userUuidParamsSchema }), superAdminController.resetUserMfa);
router.delete('/users/:uuid', validate({ params: userUuidParamsSchema }), superAdminController.deleteUser);

export default router;
