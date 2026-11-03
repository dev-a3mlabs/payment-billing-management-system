-- AlterTable
ALTER TABLE `access_user_values` ADD COLUMN `locked` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `access_grants` (
    `user_id` INTEGER NOT NULL,
    `access_key_id` INTEGER NOT NULL,
    `granted_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `access_grants_access_key_id_idx`(`access_key_id`),
    INDEX `access_grants_granted_by_id_idx`(`granted_by_id`),
    PRIMARY KEY (`user_id`, `access_key_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_access_key_id_fkey` FOREIGN KEY (`access_key_id`) REFERENCES `access_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_granted_by_id_fkey` FOREIGN KEY (`granted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
