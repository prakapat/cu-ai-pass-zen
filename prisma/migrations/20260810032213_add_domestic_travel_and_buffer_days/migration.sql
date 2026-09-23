-- AlterTable
ALTER TABLE `CountryGroup` ADD COLUMN `travelBufferDays` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `TripPlan` ADD COLUMN `destinationProvince` VARCHAR(191) NULL,
    ADD COLUMN `tripType` ENUM('DOMESTIC', 'INTERNATIONAL') NOT NULL DEFAULT 'INTERNATIONAL',
    MODIFY `country` VARCHAR(191) NULL,
    MODIFY `countryGroup` INTEGER NULL;

-- CreateTable
CREATE TABLE `DomesticLumpSumRate` (
    `id` VARCHAR(191) NOT NULL,
    `tier` ENUM('TIER1', 'TIER2', 'TIER3', 'TIER4') NOT NULL,
    `ratePerDay` INTEGER NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2563,

    UNIQUE INDEX `DomesticLumpSumRate_tier_key`(`tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticAccommodationRate` (
    `id` VARCHAR(191) NOT NULL,
    `tier` ENUM('TIER1', 'TIER2', 'TIER3', 'TIER4') NOT NULL,
    `singleRoomMax` INTEGER NOT NULL,
    `twinRoomMax` INTEGER NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2563,

    UNIQUE INDEX `DomesticAccommodationRate_tier_key`(`tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticPerDiemRate` (
    `id` VARCHAR(191) NOT NULL,
    `tier` ENUM('TIER_A', 'TIER_B') NOT NULL,
    `ratePerDay` INTEGER NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2563,

    UNIQUE INDEX `DomesticPerDiemRate_tier_key`(`tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightClassRule` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('DOMESTIC', 'INTERNATIONAL') NOT NULL,
    `positionLabel` VARCHAR(191) NOT NULL,
    `maxClass` VARCHAR(191) NOT NULL,
    `exceptionMaxClass` VARCHAR(191) NULL,
    `exceptionThresholdHours` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `FlightClassRule_scope_positionLabel_key`(`scope`, `positionLabel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegulationConstant` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `RegulationConstant_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
