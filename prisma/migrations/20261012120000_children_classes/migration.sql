-- Children's classes: a parent books a child, says who takes them home, and
-- may book several children into the same class.

CREATE TYPE "ChildPickup" AS ENUM ('parent', 'alone', 'other');

ALTER TABLE "Practice" ADD COLUMN "isForChildren" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Booking"
  ADD COLUMN "childName" TEXT,
  ADD COLUMN "childPickup" "ChildPickup",
  ADD COLUMN "childPickupName" TEXT,
  ADD COLUMN "participantKey" TEXT NOT NULL DEFAULT '';

-- The duplicate guard now asks „same person in the same class", not „same
-- account": "" for the account holder, the child's normalised name otherwise.
DROP INDEX "unique_active_booking";
CREATE UNIQUE INDEX "unique_active_booking" ON "Booking"("userId", "scheduledClassId", "participantKey") WHERE (status != 'cancelled');
