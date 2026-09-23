-- AlterTable
ALTER TABLE `CountryGroup` ADD COLUMN `insuranceZone` INTEGER NULL;

-- AlterTable
ALTER TABLE `TripPlan` ADD COLUMN `insurancePlanTier` ENUM('ECONOMY', 'STANDARD', 'PREMIUM') NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE `InsuranceZoneRate` (
    `id` VARCHAR(191) NOT NULL,
    `zone` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `multiplier` DOUBLE NOT NULL,

    UNIQUE INDEX `InsuranceZoneRate_zone_key`(`zone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsuranceDurationTier` (
    `id` VARCHAR(191) NOT NULL,
    `minDays` INTEGER NOT NULL,
    `maxDays` INTEGER NULL,
    `basePrice` INTEGER NOT NULL,
    `extensionIncrementDays` INTEGER NULL,
    `extensionIncrementAmount` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsurancePlanTier` (
    `id` VARCHAR(191) NOT NULL,
    `tier` ENUM('ECONOMY', 'STANDARD', 'PREMIUM') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `multiplier` DOUBLE NOT NULL,
    `coverageDescription` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `InsurancePlanTier_tier_key`(`tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
