-- AlterTable
ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME(3) NULL,
    MODIFY `status` ENUM('active', 'inactive', 'suspended', 'deleted') NOT NULL DEFAULT 'active';
