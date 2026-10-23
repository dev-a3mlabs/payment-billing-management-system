-- CreateTable
CREATE TABLE `login_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `portal` VARCHAR(30) NOT NULL,
    `status` ENUM('success', 'blocked') NOT NULL,
    `block_reason` VARCHAR(50) NULL,
    `request_ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(512) NULL,
    `event_id` VARCHAR(64) NULL,
    `visitor_id` VARCHAR(64) NULL,
    `fingerprint_ip` VARCHAR(45) NULL,
    `os` VARCHAR(50) NULL,
    `browser_name` VARCHAR(50) NULL,
    `country_code` CHAR(2) NULL,
    `city` VARCHAR(100) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `browser_details` JSON NULL,
    `ip_info` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `login_events_event_id_key`(`event_id`),
    INDEX `login_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `login_events_visitor_id_idx`(`visitor_id`),
    INDEX `login_events_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `login_events` ADD CONSTRAINT `login_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `login_events` ADD CONSTRAINT `login_events_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `user_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
