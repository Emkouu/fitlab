-- A burned deposit is income: it gets rung up on the касов апарат, where cash
-- and card are different keys. So the burn has to remember how the client
-- originally paid, and whether it has been rung up yet.

ALTER TABLE "Booking" ADD COLUMN "depositBurnedMethod" "DepositEntryMethod";
ALTER TABLE "Booking" ADD COLUMN "depositFiscalizedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "depositFiscalizedMinor" INTEGER;
