-- CreateTable
CREATE TABLE `UserBankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserBankAccount_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EPaymentF12Request` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `deptCode` VARCHAR(191) NULL,
    `deptName` VARCHAR(191) NULL,
    `subject` TEXT NULL,
    `recipientTitle` VARCHAR(191) NULL,
    `authorizedPerson` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `borrowerName` VARCHAR(191) NULL,
    `borrowerPosition` VARCHAR(191) NULL,
    `fiscalYear` VARCHAR(191) NULL,
    `loanPurpose` TEXT NULL,
    `fundCode` VARCHAR(191) NULL,
    `fundName` VARCHAR(191) NULL,
    `unitName` VARCHAR(191) NULL,
    `returnDueDate` VARCHAR(191) NULL,
    `totalLoanAmount` INTEGER NULL,
    `notes` TEXT NULL,
    `refundOverpaymentConsent` BOOLEAN NOT NULL DEFAULT false,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EPaymentF12Request_tripId_key`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EPaymentF12Channel` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `channelType` ENUM('TRANSFER', 'CREDIT_CARD') NOT NULL,
    `amount` INTEGER NOT NULL,
    `sourceLabel` VARCHAR(191) NULL,
    `recipientName` VARCHAR(191) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `bankAccountNumber` VARCHAR(191) NULL,
    `bankBranch` VARCHAR(191) NULL,
    `cardNumber` VARCHAR(191) NULL,
    `cardHolderName` VARCHAR(191) NULL,
    `cardValidFrom` VARCHAR(191) NULL,
    `cardValidTo` VARCHAR(191) NULL,
    `cardType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EPaymentF12Channel_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserBankAccount` ADD CONSTRAINT `UserBankAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EPaymentF12Request` ADD CONSTRAINT `EPaymentF12Request_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `TripPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EPaymentF12Channel` ADD CONSTRAINT `EPaymentF12Channel_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `EPaymentF12Request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EPaymentF12Channel` ADD CONSTRAINT `EPaymentF12Channel_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `UserBankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
