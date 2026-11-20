import { Router } from 'express';
import { validate } from '../../../middlewares/validate.middleware.js';
import { notificationController } from './notification.controller.js';
import { notificationParamsSchema, notificationQuerySchema } from './notification.schema.js';

// Mounted at /notifications in every portal, behind that portal's authenticate().
const router = Router();

router.get('/', validate({ query: notificationQuerySchema }), notificationController.list);
router.get('/stream', notificationController.stream);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', validate({ params: notificationParamsSchema }), notificationController.markRead);

export default router;
