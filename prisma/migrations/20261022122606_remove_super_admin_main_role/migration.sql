-- Convert existing main super admins before removing the enum value
UPDATE `users` SET `role` = 'super_admin' WHERE `role` = 'super_admin_main';

-- AlterTable
ALTER TABLE `access_role_values` DROP PRIMARY KEY,
    MODIFY `role` ENUM('super_admin', 'admin', 'agent', 'user') NOT NULL,
    ADD PRIMARY KEY (`role`, `access_key_id`);

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('super_admin', 'admin', 'agent', 'user') NOT NULL;

