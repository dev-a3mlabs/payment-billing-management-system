-- DropIndex
DROP INDEX `users_mobile_number_key` ON `users`;

-- CreateIndex
CREATE UNIQUE INDEX `users_country_code_mobile_number_key` ON `users`(`country_code`, `mobile_number`);

