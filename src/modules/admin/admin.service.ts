import { ACCESS_KEYS } from '../../config/access-keys.js';
import { withTransaction } from '../../db/transaction.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { accessService } from '../access/access.service.js';
import { userRepository } from '../user/user.repository.js';
import { userService } from '../user/user.service.js';
import type { ChangeAgentStatusInput, CreateAgentInput } from './v1/admin.schema.js';

export const adminService = {
  getPermissions: (admin: AuthUser) => accessService.getUserValues(admin),

  getAgentQuota: async (admin: AuthUser) => {
    const [currentAgents, maxAgents] = await Promise.all([
      userRepository.countChildren(admin.id),
      accessService.getNumber(admin, ACCESS_KEYS.agentMax),
    ]);

    return { currentAgents, maxAgents };
  },

  createAgent: (input: CreateAgentInput, admin: AuthUser) =>
    withTransaction(async (tx) => {
      // Locks the admin row so two parallel requests can't both pass the limit.
      await userRepository.lockById(admin.id, tx);

      const [canCreateAgents, maxAgents, currentAgents] = await Promise.all([
        accessService.hasPermission(admin, ACCESS_KEYS.agentCreate),
        accessService.getNumber(admin, ACCESS_KEYS.agentMax),
        userRepository.countChildren(admin.id, tx),
      ]);
      if (!canCreateAgents) {
        throw ApiError.forbidden('You do not have permission to create agents');
      }
      if (currentAgents >= maxAgents) {
        throw ApiError.forbidden('You have reached the maximum number of agents you can create');
      }

      return userService.create({ ...input, role: Role.agent, createdById: admin.id, parentId: admin.id }, tx);
    }),

  changeAgentStatus: async (agentUuid: string, { status }: ChangeAgentStatusInput, admin: AuthUser, client: ClientInfo) => {
    if (!(await accessService.hasPermission(admin, ACCESS_KEYS.agentStatusChange))) {
      throw ApiError.forbidden('You do not have permission to change agent status');
    }

    const agent = await userRepository.findByUuid(agentUuid);
    if (!agent || agent.parentId !== admin.id || agent.status === UserStatus.deleted) {
      throw ApiError.notFound('Agent not found');
    }
    if (agent.status === UserStatus.suspended) {
      throw ApiError.forbidden('You cannot change the status of this agent');
    }

    await userService.changeStatus(agent, status, admin.id, client);
  },
};
