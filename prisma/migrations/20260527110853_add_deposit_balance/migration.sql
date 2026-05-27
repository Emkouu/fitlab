-- AlterTable
ALTER TABLE "Studio" ALTER COLUMN "cancelWindowHours" SET DEFAULT 4;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "depositBalance" INTEGER NOT NULL DEFAULT 0;
