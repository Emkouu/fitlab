/**
 * Deposit model — single source of truth.
 *
 * A deposit is a DISCRETE unit, not a spendable wallet balance. The client
 * pays a fixed deposit (always €10) physically at the studio; an admin records
 * it. Booking a class consumes exactly one deposit; a timely cancellation
 * returns it; a late cancel / no-show forfeits it. Every new booking needs its
 * own deposit — clients do NOT accumulate a bank they can draw arbitrary
 * amounts from.
 *
 * Storage: we reuse `User.depositBalance` (EUR cents) as the store, but treat
 * it strictly as `count × DEPOSIT_UNIT_MINOR`. All deposit money-movements
 * (grant, consume, refund) move by exactly DEPOSIT_UNIT_MINOR so the balance
 * always divides cleanly into whole deposits.
 */

/** One deposit, in EUR minor units (cents). €10.00. */
export const DEPOSIT_UNIT_MINOR = 1000;

/** How many whole deposits a stored balance (cents) represents. */
export function depositCount(balanceMinor: number): number {
  if (!Number.isFinite(balanceMinor) || balanceMinor <= 0) return 0;
  return Math.floor(balanceMinor / DEPOSIT_UNIT_MINOR);
}

/** Stored balance (cents) for a whole number of deposits. */
export function depositsToMinor(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count) * DEPOSIT_UNIT_MINOR;
}
