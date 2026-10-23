import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { userService } from '../user/user.service.js';
import type { CreateAgentInput } from './v1/admin.schema.js';

export const adminService = {
  createAgent: (input: CreateAgentInput, admin: AuthUser) =>
    userService.create({ ...input, role: Role.agent, createdById: admin.id, parentId: admin.id }),
};
