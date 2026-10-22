-- CreateTable
CREATE TABLE `access_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `kind` ENUM('permission', 'limit', 'policy') NOT NULL,
    `value_type` ENUM('bool', 'int', 'string') NOT NULL,
    `default_value` VARCHAR(255) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `access_keys_key_key`(`key`),
    INDEX `access_keys_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `access_role_values` (
    `role` ENUM('super_admin_main', 'super_admin', 'admin', 'agent', 'user') NOT NULL,
    `access_key_id` INTEGER NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `updated_by_id` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `access_role_values_access_key_id_idx`(`access_key_id`),
    INDEX `access_role_values_updated_by_id_idx`(`updated_by_id`),
    PRIMARY KEY (`role`, `access_key_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `access_user_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `access_key_id` INTEGER NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `updated_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `access_user_values_access_key_id_idx`(`access_key_id`),
    INDEX `access_user_values_updated_by_id_idx`(`updated_by_id`),
    UNIQUE INDEX `access_user_values_user_id_access_key_id_key`(`user_id`, `access_key_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `access_role_values` ADD CONSTRAINT `access_role_values_access_key_id_fkey` FOREIGN KEY (`access_key_id`) REFERENCES `access_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_role_values` ADD CONSTRAINT `access_role_values_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_user_values` ADD CONSTRAINT `access_user_values_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_user_values` ADD CONSTRAINT `access_user_values_access_key_id_fkey` FOREIGN KEY (`access_key_id`) REFERENCES `access_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_user_values` ADD CONSTRAINT `access_user_values_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
