-- AlterTable
ALTER TABLE `TripPlan` ADD COLUMN `requesterId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `role` ENUM('REQUESTER', 'APPROVER', 'FINANCE_OFFICER', 'ADMIN') NOT NULL DEFAULT 'REQUESTER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `TripPlan_requesterId_idx` ON `TripPlan`(`requesterId`);

-- AddForeignKey
ALTER TABLE `TripPlan` ADD CONSTRAINT `TripPlan_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
