import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../src/db/prisma.js';
import { Role } from '../src/generated/prisma/enums.js';
import { logger } from '../src/utils/logger.js';

const seedEnvSchema = z.object({
  SUPER_ADMIN_USERNAME: z.string().min(1, 'SUPER_ADMIN_USERNAME is required'),
  SUPER_ADMIN_EMAIL: z.email('SUPER_ADMIN_EMAIL must be a valid email'),
  SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters'),
  SUPER_ADMIN_FIRST_NAME: z.string().min(1, 'SUPER_ADMIN_FIRST_NAME is required'),
});

const seedSuperAdminMain = async () => {
  const existing = await prisma.user.findFirst({ where: { role: Role.super_admin_main } });
  if (existing) {
    logger.info(`super_admin_main already exists (${existing.username}), skipping`);
    return;
  }

  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error('Invalid seed environment variables:', z.flattenError(parsed.error).fieldErrors);
    process.exitCode = 1;
    return;
  }
  const seedEnv = parsed.data;

  const passwordHash = await bcrypt.hash(seedEnv.SUPER_ADMIN_PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      username: seedEnv.SUPER_ADMIN_USERNAME,
      email: seedEnv.SUPER_ADMIN_EMAIL,
      passwordHash,
      role: Role.super_admin_main,
      firstName: seedEnv.SUPER_ADMIN_FIRST_NAME,
      mustChangePassword: true,
    },
  });

  logger.info(`super_admin_main created (${user.username})`);
};

seedSuperAdminMain()
  .catch((err) => {
    logger.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
