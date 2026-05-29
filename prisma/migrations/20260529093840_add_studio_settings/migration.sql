-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "address" TEXT,
ADD COLUMN     "defaultDeposit" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "phone" TEXT;
