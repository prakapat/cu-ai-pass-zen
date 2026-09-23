-- CreateTable
CREATE TABLE `PublicHoliday` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `PublicHoliday_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
