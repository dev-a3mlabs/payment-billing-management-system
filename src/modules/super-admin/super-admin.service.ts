import { randomInt } from 'node:crypto';
import { ERROR_CODES } from '../../config/error-codes.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../middlewares/auth.middleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { accessService } from '../access/access.service.js';
import { mfaService } from '../mfa/mfa.service.js';
import { userRepository } from '../user/user.repository.js';
import { userService } from '../user/user.service.js';
import { sessionService } from '../session/session.service.js';
import { userSecurityService } from '../user-security/user-security.service.js';
import { superAdminRepository } from './super-admin.repository.js';
import type { ClientInfo } from '../../utils/request.js';
import type {
  ChangeUserStatusInput,
  CreateUserInput,
  UpdateUserGrantsInput,
  UpdateUserPermissionsInput,
} from './v1/super-admin.schema.js';

const MAX_USERNAME_LENGTH = 30;
const SUGGESTION_COUNT = 3;
const PAGE_SIZE = 10;

// Every suffix ends with a digit, so a candidate never ends with a dot.
const buildUsernameCandidates = (username: string) => {
  const suffixes = ['1', '_1', '.1', '2', '_2', '.2', '3', '_3'];
  for (let i = 0; i < 4; i++) {
    suffixes.push(String(randomInt(10, 1000)), `_${randomInt(10, 1000)}`);
  }

  const candidates = suffixes.map((suffix) => username.slice(0, MAX_USERNAME_LENGTH - suffix.length) + suffix);
  return [...new Set(candidates)].filter((candidate) => candidate !== username);
};

const MANAGED_ROLES: Role[] = [Role.admin, Role.agent];

const findManagedUser = async (uuid: string) => {
  const user = await userRepository.findByUuid(uuid);
  if (!user || !MANAGED_ROLES.includes(user.role) || user.status === UserStatus.deleted) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

const findManagedAdmin = async (uuid: string) => {
  const user = await findManagedUser(uuid);
  if (user.role !== Role.admin) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

export const superAdminService = {
  checkUsername: async (username: string) => {
    if (!(await userRepository.isUsernameTaken(username))) {
      return { username, available: true, suggestions: [] };
    }

    const candidates = buildUsernameCandidates(username);
    const taken = new Set(await superAdminRepository.findTakenUsernames(candidates));
    const suggestions = candidates.filter((candidate) => !taken.has(candidate)).slice(0, SUGGESTION_COUNT);

    return { username, available: false, suggestions };
  },

  createUser: async (input: CreateUserInput, creator: AuthUser) => {
    let parentId: number | undefined;
    if (input.role === Role.agent) {
      const admin = await userRepository.findByUuid(input.adminUuid);
      if (!admin || admin.role !== Role.admin || admin.status !== UserStatus.active) {
        throw ApiError.badRequest('Admin not found or not active', ERROR_CODES.INVALID_ADMIN);
      }
      parentId = admin.id;
    }

    return userService.create({
      username: input.username,
      password: input.password,
      role: input.role,
      createdById: creator.id,
      parentId,
    });
  },


  listAdmins: async (requester: AuthUser) => {
    return userRepository.findAllByRole(Role.admin);
  },


  listAgents: async (requester: AuthUser) => {
    return userRepository.findAllByRole(Role.agent);
  },

  listAdminAgents: async (adminUuid: string, page: number) => {
    const admin = await userRepository.findByUuid(adminUuid);
    if (!admin || admin.role !== Role.admin || admin.status === UserStatus.deleted) {
      throw ApiError.notFound('Admin not found');
    }

    const [agents, total] = await Promise.all([
      userRepository.findAgentsByParent(admin.id, page, PAGE_SIZE),
      userRepository.countAgentsByParent(admin.id),
    ]);

    return {
      agents,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    };
  },

  listPermissions: () => accessService.listDefinitions(),

  getUserPermissions: async (uuid: string) => accessService.getUserValues(await findManagedUser(uuid)),

  updateUserPermissions: async (
    uuid: string,
    { values }: UpdateUserPermissionsInput,
    superAdmin: AuthUser,
    client: ClientInfo,
  ) => {
    const user = await findManagedUser(uuid);
    await accessService.setUserValues(user, values, superAdmin, client);
    return accessService.getUserValues(user);
  },

  resetUserPermission: async (uuid: string, key: string) => {
    const user = await findManagedUser(uuid);
    await accessService.resetUserValue(user, key, Role.super_admin);
    return accessService.getUserValues(user);
  },

  unlockUserPermission: async (uuid: string, key: string, superAdmin: AuthUser, client: ClientInfo) => {
    const user = await findManagedUser(uuid);
    await accessService.unlockUserValue(user, key, superAdmin.id, client);
    return accessService.getUserValues(user);
  },

  getUserGrants: async (uuid: string) => accessService.getGrants(await findManagedAdmin(uuid)),

  updateUserGrants: async (uuid: string, { keys }: UpdateUserGrantsInput, superAdmin: AuthUser, client: ClientInfo) => {
    const admin = await findManagedAdmin(uuid);
    await accessService.setGrants(admin, keys, superAdmin, client);
    return accessService.getGrants(admin);
  },

  changeUserStatus: async (uuid: string, { status }: ChangeUserStatusInput, superAdmin: AuthUser, client: ClientInfo) =>
    userService.changeStatus(await findManagedUser(uuid), status, superAdmin.id, client),

  getUserSessions: async (uuid: string) => sessionService.list((await findManagedUser(uuid)).id),

  revokeUserSessions: async (uuid: string) => {
    await sessionService.revokeAll((await findManagedUser(uuid)).id);
  },

  unlockUser: async (uuid: string, superAdmin: AuthUser, client: ClientInfo) =>
    userSecurityService.unlock((await findManagedUser(uuid)).id, superAdmin.id, client),

  getUserMfa: async (uuid: string) => mfaService.getStatus(await findManagedUser(uuid)),

  resetUserMfa: async (uuid: string, superAdmin: AuthUser, client: ClientInfo) =>
    mfaService.reset((await findManagedUser(uuid)).id, superAdmin.id, client),

  deleteUser: async (uuid: string, superAdmin: AuthUser, client: ClientInfo) =>
    userService.changeStatus(await findManagedUser(uuid), UserStatus.deleted, superAdmin.id, client),
};
