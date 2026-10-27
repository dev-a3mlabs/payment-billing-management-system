-- AlterTable
ALTER TABLE `login_events` MODIFY `status` ENUM('success', 'failed', 'blocked') NOT NULL;

-- CreateTable
CREATE TABLE `user_security` (
    `user_id` INTEGER NOT NULL,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `last_failed_login_at` DATETIME(3) NULL,
    `locked_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_security_locked_at_idx`(`locked_at`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_security` ADD CONSTRAINT `user_security_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
