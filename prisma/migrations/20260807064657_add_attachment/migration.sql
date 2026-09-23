-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `type` ENUM('INVITATION_LETTER', 'SIGNED_MEMO', 'RECEIPT', 'OTHER') NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `fileData` LONGBLOB NOT NULL,
    `ocrData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `TripPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
