-- Old refresh tokens have no session, so everyone logs in again
DELETE FROM `refresh_tokens`;

-- DropForeignKey
ALTER TABLE `refresh_tokens` DROP FOREIGN KEY `refresh_tokens_user_id_fkey`;

-- DropIndex
DROP INDEX `refresh_tokens_user_id_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `refresh_tokens` DROP COLUMN `user_id`,
    ADD COLUMN `session_id` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `refresh_tokens_session_id_idx` ON `refresh_tokens`(`session_id`);

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

