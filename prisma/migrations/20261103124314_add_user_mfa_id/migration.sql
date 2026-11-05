-- CreateIndex (first, so the user_id foreign key keeps an index when the primary key moves)
CREATE UNIQUE INDEX `user_mfa_user_id_key` ON `user_mfa`(`user_id`);

-- AlterTable
ALTER TABLE `user_mfa` DROP PRIMARY KEY,
    ADD COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);
