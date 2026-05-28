-- Corrective migration: the previous migration created `_TrainerSpecialties`
-- with A → Trainer / B → Practice, but Prisma's implicit M:N convention is
-- alphabetical (Practice < Trainer), so the generated client emits SQL with
-- A → Practice / B → Trainer. The mismatch causes
-- `_TrainerSpecialties_A_fkey` violations on every set/connect.
--
-- The join table has no rows yet (verified before writing this migration), so
-- we drop and recreate it with the correct A/B mapping.

DROP TABLE IF EXISTS "_TrainerSpecialties";

CREATE TABLE "_TrainerSpecialties" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TrainerSpecialties_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_TrainerSpecialties_B_index" ON "_TrainerSpecialties"("B");

ALTER TABLE "_TrainerSpecialties"
  ADD CONSTRAINT "_TrainerSpecialties_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Practice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TrainerSpecialties"
  ADD CONSTRAINT "_TrainerSpecialties_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Trainer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
