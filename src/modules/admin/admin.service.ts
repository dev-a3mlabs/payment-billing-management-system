import { ACCESS_KEYS } from '../../config/access-keys.js';
import { SESSION_REVOKE_REASONS } from '../../config/session-revoke-reasons.js';
import { withTransaction } from '../../db/transaction.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ClientInfo } from '../../utils/request.js';
import { accessService } from '../access/access.service.js';
import { mfaService } from '../mfa/mfa.service.js';
import { sessionService } from '../session/session.service.js';
import { userRepository } from '../user/user.repository.js';
import { userService } from '../user/user.service.js';
import type { UpdateUserPermissionsInput } from '../super-admin/v1/super-admin.schema.js';
import type { ChangeAgentStatusInput, CreateAgentInput } from './v1/admin.schema.js';


const AGENTS_PAGE_SIZE = 10;

const findOwnAgent = async (uuid: string, admin: AuthUser) => {
  const agent = await userRepository.findByUuid(uuid);
  if (!agent || agent.parentId !== admin.id || agent.status === UserStatus.deleted) {
    throw ApiError.notFound('Agent not found');
  }
  return agent;
};

const findAgentForSessionRevoke = async (uuid: string, admin: AuthUser) => {
  if (!(await accessService.hasPermission(admin, ACCESS_KEYS.agentSessionRevoke))) {
    throw ApiError.forbidden('You do not have permission to log out agent devices');
  }
  return findOwnAgent(uuid, admin);
};

// An admin can only change keys the super admin granted them, and only while the value isn't locked.
const getAgentValues = async (agent: { id: number; role: Role }, admin: AuthUser) => {
  const [values, grantedKeys] = await Promise.all([
    accessService.getUserValues(agent, admin.role),
    accessService.getGrantedKeys(admin),
  ]);
  return values.map((value) => ({ ...value, editable: grantedKeys.includes(value.key) && !value.locked }));
};

export const adminService = {
  getPermissions: () =>
    accessService.listDefinitions().map((definition) => ({
      ...definition,
      appliesTo: definition.appliesTo.filter((role) => role !== Role.super_admin),
      editableBy: definition.editableBy.filter((role) => role !== Role.super_admin),
    })),

  getOwnPermissions: (admin: AuthUser) => accessService.getUserValues(admin),

  getAgentPermissions: async (agentUuid: string, admin: AuthUser) =>
    getAgentValues(await findOwnAgent(agentUuid, admin), admin),

  getAgentSessions: async (agentUuid: string, admin: AuthUser) =>
    sessionService.list((await findOwnAgent(agentUuid, admin)).id),

  revokeAgentSessions: async (agentUuid: string, admin: AuthUser, client: ClientInfo) =>
    sessionService.revokeAll((await findAgentForSessionRevoke(agentUuid, admin)).id, admin, client),

  revokeAgentSession: async (agentUuid: string, sessionUuid: string, admin: AuthUser, client: ClientInfo) =>
    sessionService.revokeOne(
      (await findAgentForSessionRevoke(agentUuid, admin)).id,
      sessionUuid,
      SESSION_REVOKE_REASONS.revokedByAdmin,
      admin,
      client,
    ),

  updateAgentPermissions: async (
    agentUuid: string,
    { values }: UpdateUserPermissionsInput,
    admin: AuthUser,
    client: ClientInfo,
  ) => {
    const agent = await findOwnAgent(agentUuid, admin);

    const editableKeys = (await getAgentValues(agent, admin)).filter((value) => value.editable).map((value) => value.key);
    if (Object.keys(values).some((key) => !editableKeys.includes(key))) {
      throw ApiError.forbidden('You do not have permission to change these permissions');
    }

    await accessService.setUserValues(agent, values, admin, client);
    return getAgentValues(agent, admin);
  },

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

    const agent = await findOwnAgent(agentUuid, admin);
    if (agent.status === UserStatus.suspended) {
      throw ApiError.forbidden('You cannot change the status of this agent');
    }

    await userService.changeStatus(agent, status, admin.id, client);
  },


  getAgents: async (admin: AuthUser, page: number) => {
    const [agents, total] = await Promise.all([
      userRepository.findAgentsByParent(admin.id, page, AGENTS_PAGE_SIZE),
      userRepository.countAgentsByParent(admin.id),
    ]);

    return {
      items: await sessionService.withActiveDevices(agents),
      pagination: {
        page,
        pageSize: AGENTS_PAGE_SIZE,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / AGENTS_PAGE_SIZE)),
      },
    };
  },



  deleteAgent: async (agentUuid: string, admin: AuthUser, client: ClientInfo) => {
    if (!(await accessService.hasPermission(admin, ACCESS_KEYS.agentDelete))) {
      throw ApiError.forbidden('You do not have permission to delete agents');
    }

    const agent = await findOwnAgent(agentUuid, admin);
    if (agent.status === UserStatus.suspended) {
      throw ApiError.forbidden('You cannot delete this agent');
    }

    await userService.changeStatus(agent, UserStatus.deleted, admin.id, client);
  },

  getAgentMfa: async (agentUuid: string, admin: AuthUser) => mfaService.getStatus(await findOwnAgent(agentUuid, admin)),

  resetAgentMfa: async (agentUuid: string, admin: AuthUser, client: ClientInfo) => {
    if (!(await accessService.hasPermission(admin, ACCESS_KEYS.agentMfaReset))) {
      throw ApiError.forbidden('You do not have permission to reset agent MFA');
    }

    const agent = await findOwnAgent(agentUuid, admin);
    if (agent.status === UserStatus.suspended) {
      throw ApiError.forbidden('You cannot reset MFA for this agent');
    }

    await mfaService.reset(agent.id, admin.id, client);
  },
};
