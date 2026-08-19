/**
 * The one „първо посещение" reservation.
 *
 * A client with no deposit on the profile normally cannot reserve online at
 * all: the deposit is the guarantee that makes a spot holdable. That is fair to
 * regulars and unfair to a newcomer, who is asked for €10 before ever seeing
 * the room. So a client who has never booked anything may reserve once without
 * paying — status `pending_deposit`, deposit settled at the desk when they
 * arrive.
 *
 * Eligibility is deliberately „no bookings at all, in any status":
 *
 *  - it makes the privilege once-only without a second column to keep in sync —
 *    after the free booking exists, the count is 1 and the door is shut;
 *  - a cancelled booking still counts, so booking-then-cancelling does not
 *    hand out a fresh free visit each time.
 *
 * The engine records the fact on `Booking.isFirstVisit` so staff see „първо
 * посещение" in Attendance and know to explain the deposit and collect it.
 */
export function isFirstVisitEligible(bookingsEver: number): boolean {
  return bookingsEver === 0;
}
