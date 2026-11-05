-- AlterTable
ALTER TABLE `login_events` ADD COLUMN `attempted_username` VARCHAR(100) NULL,
    ADD COLUMN `is_impossible_travel` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_new_device` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_new_location` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfa_method` VARCHAR(20) NULL,
    MODIFY `user_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `security_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `login_event_id` BIGINT NULL,
    `metadata` JSON NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `security_alerts_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `security_alerts_login_event_id_idx`(`login_event_id`),
    INDEX `security_alerts_resolved_by_id_idx`(`resolved_by_id`),
    INDEX `security_alerts_resolved_at_idx`(`resolved_at`),
    INDEX `security_alerts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `login_events_user_id_visitor_id_idx` ON `login_events`(`user_id`, `visitor_id`);

-- CreateIndex
CREATE INDEX `login_events_user_id_country_code_city_idx` ON `login_events`(`user_id`, `country_code`, `city`);

-- CreateIndex
CREATE INDEX `login_events_status_created_at_idx` ON `login_events`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `login_events_request_ip_idx` ON `login_events`(`request_ip`);

-- CreateIndex
CREATE INDEX `login_events_country_code_idx` ON `login_events`(`country_code`);

-- AddForeignKey
ALTER TABLE `security_alerts` ADD CONSTRAINT `security_alerts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_alerts` ADD CONSTRAINT `security_alerts_login_event_id_fkey` FOREIGN KEY (`login_event_id`) REFERENCES `login_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_alerts` ADD CONSTRAINT `security_alerts_resolved_by_id_fkey` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
