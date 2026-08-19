/**
 * „Недовършено плащане на депозит" — a card hold nobody ever paid for.
 *
 * The card path holds the spot the moment the booking row is created, before
 * the client ever reaches the bank: that is deliberate (SPEC §5.3 — the spot is
 * held while they type their card details). But a client who closes the bank's
 * page leaves a booking that looks exactly like a real one. In Attendance it
 * showed up as „Чака" inside „Записани (5)", so staff counted five people for a
 * class four had actually booked.
 *
 * These are not the same as `pending_deposit`: that is a client who chose to pay
 * at the desk and is expected to walk in. This is someone who started paying
 * online and stopped.
 *
 * The spot itself is not leaked — `createBooking` sweeps stale card holds older
 * than 15 minutes on the same class inside its locked transaction, so the next
 * client to book reclaims it. What was wrong was the arithmetic staff were
 * shown, which is what this separates.
 */

import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";

export type DepositHoldRow = {
  /** `Booking.source` — only the card path can leave a hold like this. */
  source: string;
  status: BookingStatus;
  /** Status of the linked `Payment`, or null when none was ever created. */
  paymentStatus: PaymentStatus | null;
};

/**
 * Is this booking a card hold whose deposit was never paid?
 *
 * `status = paid` means the return leg settled it, so only `booked` can be
 * unfinished. A `Payment` row that already reads `paid` means the money arrived
 * even if the booking status has not caught up yet — trust the payment.
 */
export function isUnfinishedCardDeposit(row: DepositHoldRow): boolean {
  if (row.source !== "card") return false;
  if (row.status !== BookingStatus.booked) return false;
  return row.paymentStatus !== PaymentStatus.paid;
}
