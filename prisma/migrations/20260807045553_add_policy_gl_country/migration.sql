-- CreateTable
CREATE TABLE `PolicyRate` (
    `id` VARCHAR(191) NOT NULL,
    `tier` ENUM('TIER1', 'TIER2') NOT NULL,
    `countryGroup` INTEGER NOT NULL,
    `perDiemLumpSum` INTEGER NOT NULL,
    `accommodationMax` INTEGER NOT NULL,
    `perDiemItemized` INTEGER NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2563,

    UNIQUE INDEX `PolicyRate_tier_countryGroup_effectiveYear_key`(`tier`, `countryGroup`, `effectiveYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GLCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `GLCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CountryGroup` (
    `id` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `group` INTEGER NOT NULL,

    UNIQUE INDEX `CountryGroup_country_key`(`country`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
