-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supabaseUserId" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

