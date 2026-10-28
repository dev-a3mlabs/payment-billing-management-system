-- AlterTable
ALTER TABLE `user_sessions` ADD COLUMN `visitor_id` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `user_sessions_user_id_visitor_id_idx` ON `user_sessions`(`user_id`, `visitor_id`);
