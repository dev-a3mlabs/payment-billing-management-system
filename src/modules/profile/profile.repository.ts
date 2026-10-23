import { prisma } from '../../db/prisma.js';
import type { UpdateProfileInput } from './v1/profile.schema.js';

const PROFILE_FIELDS = {
  uuid: true,
  username: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  countryCode: true,
  mobileNumber: true,
  updatedAt: true,
} as const;

export const profileRepository = {
  isEmailTaken: async (email: string, excludeUserId: number) =>
    (await prisma.user.findFirst({ where: { email, id: { not: excludeUserId } }, select: { id: true } })) !== null,

  isMobileTaken: async (countryCode: string, mobileNumber: string, excludeUserId: number) =>
    (await prisma.user.findFirst({
      where: { countryCode, mobileNumber, id: { not: excludeUserId } },
      select: { id: true },
    })) !== null,

  updateProfile: (userId: number, data: UpdateProfileInput) =>
    prisma.user.update({ where: { id: userId }, data, select: PROFILE_FIELDS }),
};
