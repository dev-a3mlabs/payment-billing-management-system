-- AlterTable
ALTER TABLE `users` ADD COLUMN `parent_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `users_parent_id_idx` ON `users`(`parent_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
