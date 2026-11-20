import { Router } from 'express';
import { validate } from '../../../middlewares/validate.middleware.js';
import { changeRequestController } from './change-request.controller.js';
import {
  changeRequestParamsSchema,
  changeRequestQuerySchema,
  createChangeRequestSchema,
  rejectChangeRequestSchema,
} from './change-request.schema.js';

// The logged-in user's own requests; mounted at /profile/change-requests in the admin and agent portals.
export const ownChangeRequestRoutes = Router();

ownChangeRequestRoutes.get('/', validate({ query: changeRequestQuerySchema }), changeRequestController.listOwn);
ownChangeRequestRoutes.post('/', validate({ body: createChangeRequestSchema }), changeRequestController.create);
ownChangeRequestRoutes.delete('/:uuid', validate({ params: changeRequestParamsSchema }), changeRequestController.cancel);

// Requests to review; mounted at /change-requests in the super admin and admin portals.
export const reviewChangeRequestRoutes = Router();

reviewChangeRequestRoutes.get('/', validate({ query: changeRequestQuerySchema }), changeRequestController.list);
reviewChangeRequestRoutes.get('/:uuid', validate({ params: changeRequestParamsSchema }), changeRequestController.get);
reviewChangeRequestRoutes.post(
  '/:uuid/approve',
  validate({ params: changeRequestParamsSchema }),
  changeRequestController.approve,
);
reviewChangeRequestRoutes.post(
  '/:uuid/reject',
  validate({ params: changeRequestParamsSchema, body: rejectChangeRequestSchema }),
  changeRequestController.reject,
);
