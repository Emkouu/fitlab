/**
 * Deposits the studio actually kept („усвоени депозити").
 *
 * A deposit is a standing guarantee that normally just sits on the profile —
 * booking never debits it. It only turns into money the studio keeps when the
 * client burns it: a no-show, or a cancellation after the studio's window. That
 * moment is recorded on `Booking.depositBurnedMinor` by
 * `lib/payments/depositLedger.ts`.
 *
 * Read that column and nothing else. The deposit amount is configurable, so a
 * client who paid €10 before a rise to €20 burned €10 — recomputing from
 * today's setting would invent money that never changed hands. A correction of
 * a mis-tapped no-show clears the column, so a restored deposit drops out of
 * the total on its own.
 */

export type BurnedDepositRow = {
  /** `Booking.depositBurnedMinor` — NULL when nothing was ever burned. */
  depositBurnedMinor: number | null;
  /** Sofia day key of the class this booking was for. */
  classDayKey: string;
};

export type BurnedDepositTotals = {
  /** Sum of everything burned, in EUR cents. */
  totalMinor: number;
  /** How many bookings contributed — a burn count, not a booking count. */
  count: number;
  /** Per Sofia day, ascending. Only days with a burn appear. */
  byDay: Array<{ dayKey: string; totalMinor: number; count: number }>;
};

/**
 * Total burned across the given bookings, plus a per-day breakdown.
 *
 * Rows with no burn are ignored rather than counted as zero, so `count` answers
 * „колко депозита усвоихме", which is the number a month-end report is after.
 * A stored 0 is treated as no burn: the ledger writes the amount it actually
 * consumed, and consuming nothing is not an event worth reporting.
 */
export function burnedDepositTotals(
  rows: readonly BurnedDepositRow[],
): BurnedDepositTotals {
  const perDay = new Map<string, { totalMinor: number; count: number }>();
  let totalMinor = 0;
  let count = 0;

  for (const row of rows) {
    const burned = row.depositBurnedMinor;
    if (typeof burned !== "number" || burned <= 0) continue;

    totalMinor += burned;
    count += 1;

    const day = perDay.get(row.classDayKey) ?? { totalMinor: 0, count: 0 };
    day.totalMinor += burned;
    day.count += 1;
    perDay.set(row.classDayKey, day);
  }

  const byDay = Array.from(perDay.entries())
    .map(([dayKey, v]) => ({ dayKey, ...v }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return { totalMinor, count, byDay };
}
