import bcrypt from 'bcrypt';
import { z } from 'zod';
import { ACCESS_KEYS } from '../src/config/access-keys.js';
import { prisma } from '../src/db/prisma.js';
import { AccessKind, AccessValueType, Role } from '../src/generated/prisma/enums.js';
import { logger } from '../src/utils/logger.js';

const seedEnvSchema = z.object({
  SUPER_ADMIN_USERNAME: z.string().min(1, 'SUPER_ADMIN_USERNAME is required'),
  SUPER_ADMIN_EMAIL: z.email('SUPER_ADMIN_EMAIL must be a valid email'),
  SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters'),
  SUPER_ADMIN_FIRST_NAME: z.string().min(1, 'SUPER_ADMIN_FIRST_NAME is required'),
});

const seedSuperAdmin = async () => {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error('Invalid seed environment variables:', z.flattenError(parsed.error).fieldErrors);
    process.exitCode = 1;
    return;
  }
  const seedEnv = parsed.data;

  let user = await prisma.user.findUnique({ where: { username: seedEnv.SUPER_ADMIN_USERNAME } });
  if (user) {
    logger.info(`Super admin already exists (${user.username}), skipping create`);
  } else {
    user = await prisma.user.create({
      data: {
        username: seedEnv.SUPER_ADMIN_USERNAME,
        email: seedEnv.SUPER_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(seedEnv.SUPER_ADMIN_PASSWORD, 10),
        role: Role.super_admin,
        firstName: seedEnv.SUPER_ADMIN_FIRST_NAME,
        mustChangePassword: false,
      },
    });
    logger.info(`Super admin created (${user.username})`);
  }

  const accessKey = await prisma.accessKey.upsert({
    where: { key: ACCESS_KEYS.superAdminCreate },
    update: {},
    create: {
      key: ACCESS_KEYS.superAdminCreate,
      module: 'super_admin',
      kind: AccessKind.permission,
      valueType: AccessValueType.bool,
      defaultValue: 'false',
      description: 'Create super admins',
    },
  });

  await prisma.accessUserValue.upsert({
    where: { userId_accessKeyId: { userId: user.id, accessKeyId: accessKey.id } },
    update: { value: 'true' },
    create: { userId: user.id, accessKeyId: accessKey.id, value: 'true', updatedById: user.id },
  });
  logger.info(`Granted ${ACCESS_KEYS.superAdminCreate} to ${user.username}`);

  await prisma.accessKey.upsert({
    where: { key: ACCESS_KEYS.maxDevices },
    update: {},
    create: {
      key: ACCESS_KEYS.maxDevices,
      module: 'auth',
      kind: AccessKind.policy,
      valueType: AccessValueType.int,
      defaultValue: '3',
      description: 'Devices logged in at the same time',
    },
  });
  logger.info(`Access key ${ACCESS_KEYS.maxDevices} ready`);
};

seedSuperAdmin()
  .catch((err) => {
    logger.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
