-- AlterTable
ALTER TABLE `login_events` DROP COLUMN `browser_details`,
    ADD COLUMN `browser_version` VARCHAR(20) NULL,
    ADD COLUMN `device_brand` VARCHAR(50) NULL,
    ADD COLUMN `device_model` VARCHAR(50) NULL,
    ADD COLUMN `device_type` VARCHAR(20) NULL,
    ADD COLUMN `os_version` VARCHAR(20) NULL;
