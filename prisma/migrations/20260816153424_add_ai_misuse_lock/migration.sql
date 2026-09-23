-- AlterTable
ALTER TABLE `User` ADD COLUMN `accountAiLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `irrelevantUploadStreak` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `irrelevantUploadTotal` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pageLockedUntil` DATETIME(3) NULL;
