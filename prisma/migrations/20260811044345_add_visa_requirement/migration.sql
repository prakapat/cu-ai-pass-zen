-- AlterTable
ALTER TABLE `CountryGroup` ADD COLUMN `estimatedVisaFee` INTEGER NULL,
    ADD COLUMN `visaRequirement` ENUM('VISA_FREE', 'VISA_ON_ARRIVAL', 'E_VISA', 'EMBASSY_VISA') NULL;
