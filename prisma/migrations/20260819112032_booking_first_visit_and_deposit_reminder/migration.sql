-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "depositReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "isFirstVisit" BOOLEAN NOT NULL DEFAULT false;
