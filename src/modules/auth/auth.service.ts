import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { ROLE_PORTAL, type Portal } from '../../config/portals.js';
import type { User } from '../../generated/prisma/client.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/token.js';
import { authRepository } from './auth.repository.js';
import type { LoginInput } from './v1/auth.schema.js';

// Compared against when the username doesn't exist, so the response takes the same time either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const INVALID_CREDENTIALS = 'Invalid credentials';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';

const issueTokens = async (user: User, portal: Portal) => {
  const refreshToken = generateRefreshToken();

  await authRepository.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken: signAccessToken({ sub: user.uuid, role: user.role, portal }),
    refreshToken,
  };
};

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
    }

    await authRepository.updateLastLogin(user.id);

    return {
      mustChangePassword: user.mustChangePassword,
      ...(await issueTokens(user, portal)),
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

  refresh: async (refreshToken: string, portal: Portal) => {
    const stored = await authRepository.findRefreshToken(hashToken(refreshToken));
    if (!stored) {
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN);
    }

    // An already-used token means it was copied, so log the user out everywhere.
    if (stored.revokedAt) {
      await authRepository.revokeAllRefreshTokens(stored.userId);
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN);
    }

    const { user } = stored;
    if (
      stored.expiresAt < new Date() ||
      user.status !== UserStatus.active ||
      ROLE_PORTAL[user.role] !== portal
    ) {
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN);
    }

    // Two requests racing with the same token: only one can revoke it, the other counts as reuse.
    const { count } = await authRepository.revokeRefreshToken({ id: stored.id });
    if (count === 0) {
      await authRepository.revokeAllRefreshTokens(user.id);
      throw ApiError.unauthorized(INVALID_REFRESH_TOKEN);
    }

    return issueTokens(user, portal);
  },

  logout: async (refreshToken: string) => {
    await authRepository.revokeRefreshToken({ tokenHash: hashToken(refreshToken) });
  },
};
