import bcrypt from 'bcrypt';
import { ROLE_PORTAL, type Portal } from '../../config/portals.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import { signAccessToken, signTempToken } from '../../utils/token.js';
import { authRepository } from './auth.repository.js';
import type { LoginInput } from './v1/auth.schema.js';

// Compared against when the username doesn't exist, so the response takes the same time either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const INVALID_CREDENTIALS = 'Invalid credentials';

export const authService = {
  login: async ({ username, password }: LoginInput, portal: Portal) => {
    const user = await authRepository.findUserByUsername(username);

    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS);
    }

    // Same message as a wrong password, so other portals' accounts aren't revealed.
    if (ROLE_PORTAL[user.role] !== portal) {
      throw ApiError.unauthorized(INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.active) {
      throw ApiError.forbidden('Your account is not active. Please contact your admin.');
    }

    if (user.mustChangePassword) {
      // The temporary password works for one login only.
      if (user.tempPasswordUsedAt) {
        throw ApiError.forbidden(
          'Your temporary password has already been used. Please contact your admin to reset it.',
        );
      }

      await authRepository.markTempPasswordUsed(user.id);

      return {
        mustChangePassword: true,
        tempToken: signTempToken({ sub: user.uuid, portal }),
      };
    }

    await authRepository.updateLastLogin(user.id);

    return {
      mustChangePassword: false,
      accessToken: signAccessToken({ sub: user.uuid, role: user.role, portal }),
      user: {
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  },
};
