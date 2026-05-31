/*
  Warnings:

  - A unique constraint covering the columns `[userId,scheduledClassId]` on the table `Waitlist` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `message` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scheduledClassId` to the `Waitlist` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Waitlist` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('spot_available', 'class_cancelled', 'reminder_24h', 'reminder_2h');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledClassId" TEXT,
ADD COLUMN     "type" "NotificationType" NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Waitlist" ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledClassId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Waitlist_scheduledClassId_notifiedAt_idx" ON "Waitlist"("scheduledClassId", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_userId_scheduledClassId_key" ON "Waitlist"("userId", "scheduledClassId");

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "ScheduledClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "ScheduledClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
