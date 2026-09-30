-- Burns of deposits paid before the DepositEntry ledger (30.08.2026) were
-- stored with no origin and showed as „неизвестен произход", which left staff
-- guessing the key on the касов апарат. Before the ledger a deposit could reach
-- a profile only two ways: a card payment (recorded in "Payment" by the bank's
-- answer) or an admin entering cash taken at the desk. So: a paid card payment
-- on the client's account by the time of the burn → card, otherwise → cash.
-- Only NULL origins are touched; rerunning is a no-op.

UPDATE "Booking" b
SET "depositBurnedMethod" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "Booking" ob
    JOIN "Payment" p ON p."id" = ob."paymentId"
    WHERE ob."userId" = b."userId"
      AND p."status" = 'paid'
      AND p."createdAt" <= COALESCE(b."cancelledAt", sc."startAt" + INTERVAL '1 day')
  ) THEN 'card'::"DepositEntryMethod"
  ELSE 'cash'::"DepositEntryMethod"
END
FROM "ScheduledClass" sc
WHERE sc."id" = b."scheduledClassId"
  AND b."depositBurnedMinor" > 0
  AND b."depositBurnedMethod" IS NULL;
