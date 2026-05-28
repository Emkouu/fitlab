/*
  Warnings:

  - You are about to drop the column `specialties` on the `Trainer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trainer" DROP COLUMN "specialties";

-- CreateTable
CREATE TABLE "_TrainerSpecialties" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TrainerSpecialties_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TrainerSpecialties_B_index" ON "_TrainerSpecialties"("B");

-- AddForeignKey
ALTER TABLE "_TrainerSpecialties" ADD CONSTRAINT "_TrainerSpecialties_A_fkey" FOREIGN KEY ("A") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrainerSpecialties" ADD CONSTRAINT "_TrainerSpecialties_B_fkey" FOREIGN KEY ("B") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
