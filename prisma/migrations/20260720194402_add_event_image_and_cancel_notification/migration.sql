-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'booking_cancelled';

-- AlterTable
ALTER TABLE "ScheduledClass" ADD COLUMN     "imageUrl" TEXT;
