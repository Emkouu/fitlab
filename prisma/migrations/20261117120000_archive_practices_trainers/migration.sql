-- Archiving instead of deleting: a practice or trainer with past classes
-- cannot be removed without destroying booking and deposit history.
ALTER TABLE "Practice" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Trainer" ADD COLUMN "archivedAt" TIMESTAMP(3);
