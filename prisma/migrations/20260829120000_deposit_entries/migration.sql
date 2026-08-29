-- Deposit movements ledger.
-- `User.depositBalance` says what a client holds now; nothing said that it ever
-- arrived. A cash deposit recorded at the desk left no trace, so it could not
-- appear in Статистика. One append-only row per movement fixes that.

CREATE TYPE "DepositEntryKind" AS ENUM ('received', 'returned', 'correction');
CREATE TYPE "DepositEntryMethod" AS ENUM ('cash', 'card', 'manual');

CREATE TABLE "DepositEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "kind" "DepositEntryKind" NOT NULL,
    "method" "DepositEntryMethod" NOT NULL,
    "recordedById" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepositEntry_createdAt_idx" ON "DepositEntry"("createdAt");
CREATE INDEX "DepositEntry_userId_createdAt_idx" ON "DepositEntry"("userId", "createdAt");

ALTER TABLE "DepositEntry" ADD CONSTRAINT "DepositEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositEntry" ADD CONSTRAINT "DepositEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
