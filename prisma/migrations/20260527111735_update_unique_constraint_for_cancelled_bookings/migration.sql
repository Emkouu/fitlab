/*
  Warnings:

  - A unique constraint covering the columns `[userId,scheduledClassId]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Booking_userId_scheduledClassId_key";

-- CreateIndex
CREATE UNIQUE INDEX "unique_active_booking" ON "Booking"("userId", "scheduledClassId") WHERE (status != 'cancelled');
