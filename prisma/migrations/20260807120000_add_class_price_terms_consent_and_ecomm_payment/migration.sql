-- Fibank virtual-POS compliance round (acquirer letter 07.08.2026):
--   * the end price of the service must be visible          → Studio.defaultClassPrice + Practice.priceMinor
--   * explicit T&C consent before the card-data page         → Booking.termsAcceptedAt / termsVersion
--   * every ECOMM response field must be preserved (§4.2)    → Payment.ecomm*
--   * refunds must go back to the same card (§I.16)          → Payment.ecommRefundTransId / refundedAmount / refundedAt

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "ecomm3dSecure" TEXT,
ADD COLUMN     "ecommApprovalCode" TEXT,
ADD COLUMN     "ecommCardMask" TEXT,
ADD COLUMN     "ecommRefundTransId" TEXT,
ADD COLUMN     "ecommResult" TEXT,
ADD COLUMN     "ecommResultCode" TEXT,
ADD COLUMN     "ecommRrn" TEXT,
ADD COLUMN     "ecommTransId" TEXT,
ADD COLUMN     "refundedAmount" INTEGER,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Practice" ADD COLUMN     "priceMinor" INTEGER;

-- AlterTable
-- €10.00 per class (minor units). Practices may override via Practice.priceMinor.
ALTER TABLE "Studio" ADD COLUMN     "defaultClassPrice" INTEGER NOT NULL DEFAULT 1000;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ecommTransId_key" ON "Payment"("ecommTransId");
