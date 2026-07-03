-- Defense-in-depth backstop for the deposit-balance debit path.
-- The application now debits atomically via a conditional UPDATE
-- (where depositBalance >= amount), but this CHECK guarantees the invariant
-- at the database level even if a future code path forgets the guard.
--
-- NOTE: if any existing row already has a negative depositBalance (e.g. from
-- the pre-fix double-spend bug), this ALTER will fail. Reconcile those rows to
-- >= 0 before applying.
ALTER TABLE "User"
  ADD CONSTRAINT "User_depositBalance_nonneg" CHECK ("depositBalance" >= 0);
