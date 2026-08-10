-- The deposit amount is no longer a hardcoded constant. It resolves
-- studio-setting first, per-class override second (lib/deposit.ts).

-- NULL now means "inherit Studio.defaultDeposit".
ALTER TABLE "ScheduledClass" ALTER COLUMN "depositAmount" DROP NOT NULL;

-- Clear the values that were never deliberate overrides: the column used to be
-- mandatory and the new-class form pre-filled it from the studio default, so
-- every row sitting on a studio default (current or the old 2000 schema
-- default) is inherited, not chosen. Those become NULL and follow the setting.
--
-- Rows holding any OTHER amount were typed by hand for that specific class and
-- are kept as real overrides.
UPDATE "ScheduledClass" sc
SET "depositAmount" = NULL
WHERE sc."depositAmount" IN (
  2000,
  (SELECT s."defaultDeposit" FROM "Studio" s WHERE s."id" = sc."studioId")
);

-- Match the default to the €10 clients were actually quoted and charged.
-- Existing studio rows keep whatever amount they already hold.
ALTER TABLE "Studio" ALTER COLUMN "defaultDeposit" SET DEFAULT 1000;

-- How much a burn actually took, so correcting a mis-tapped no_show restores
-- exactly that rather than whatever the setting says at correction time.
ALTER TABLE "Booking" ADD COLUMN "depositBurnedMinor" INTEGER;
