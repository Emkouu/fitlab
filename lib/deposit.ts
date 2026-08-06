/**
 * Deposit model — single source of truth.
 *
 * A deposit is paid ONCE (always €10, physically at the studio; an admin
 * records it) and then STAYS on the profile. It is not a per-booking fee and
 * not a spendable wallet: it is the standing guarantee that lets a client
 * reserve a spot online, over and over.
 *
 * Booking a class does NOT touch it. Attending does NOT touch it. It is only
 * consumed ("усвоява се") when the client breaks the deal:
 *   - `no_show` on a booked class, or
 *   - cancelling later than the studio's `cancelWindowHours`.
 * After that the client must pay a new deposit at the studio to reserve again.
 *
 * The class fee itself is a separate thing — always settled on-site, recorded
 * by staff in Attendance (see lib/payments/classFeeMethods.ts).
 *
 * Storage: we reuse `User.depositBalance` (EUR cents) as the store, but treat
 * it strictly as `count × DEPOSIT_UNIT_MINOR`. All deposit money-movements
 * (grant, burn, restore) move by exactly DEPOSIT_UNIT_MINOR so the balance
 * always divides cleanly into whole deposits. In practice a client holds 0 or
 * 1; the count shape survives so staff can record edge cases.
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
