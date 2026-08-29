/**
 * Deposits the studio actually kept („усвоени депозити").
 *
 * A deposit is a standing guarantee that normally just sits on the profile —
 * booking never debits it. It only turns into money the studio keeps when the
 * client burns it: a no-show, or a cancellation after the studio's window. That
 * moment is recorded on `Booking.depositBurnedMinor` by
 * `lib/payments/depositLedger.ts`.
 *
 * A burn is also the only moment a deposit becomes **income**: the studio rings
 * it up on the касов апарат, where „в брой" and „с карта" are different keys.
 * That is why the totals split by origin (`Booking.depositBurnedMethod`,
 * snapshotted at burn time) and by whether it has been rung up yet.
 *
 * Read that column and nothing else. The deposit amount is configurable, so a
 * client who paid €10 before a rise to €20 burned €10 — recomputing from
 * today's setting would invent money that never changed hands. A correction of
 * a mis-tapped no-show clears the column, so a restored deposit drops out of
 * the total on its own.
 */

/** Where the burned deposit originally came from — which key on the register. */
export type BurnOriginKey = "cash" | "card" | "manual" | "unknown";

export type BurnedDepositRow = {
  /** `Booking.depositBurnedMinor` — NULL when nothing was ever burned. */
  depositBurnedMinor: number | null;
  /** Sofia day key of the class this booking was for. */
  classDayKey: string;
  /** `Booking.depositBurnedMethod` — how the client had paid it. */
  method?: BurnOriginKey | null;
  /** Whether this burn has already been rung up on the касов апарат. */
  fiscalized?: boolean;
};

export type BurnedGroup = { totalMinor: number; count: number };

export type BurnedDepositTotals = {
  /** Sum of everything burned, in EUR cents. */
  totalMinor: number;
  /** How many bookings contributed — a burn count, not a booking count. */
  count: number;
  /** Per Sofia day, ascending. Only days with a burn appear. */
  byDay: Array<{ dayKey: string; totalMinor: number; count: number }>;
  /**
   * Split by how the client originally paid, because that is the split the
   * касов апарат needs: cash and card are rung up on different keys.
   */
  byOrigin: Record<BurnOriginKey, BurnedGroup>;
  /** Still to be rung up. */
  pending: BurnedGroup;
  /** Already rung up. */
  fiscalized: BurnedGroup;
};

const EMPTY_ORIGINS = (): Record<BurnOriginKey, BurnedGroup> => ({
  cash: { totalMinor: 0, count: 0 },
  card: { totalMinor: 0, count: 0 },
  manual: { totalMinor: 0, count: 0 },
  unknown: { totalMinor: 0, count: 0 },
});

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
  const byOrigin = EMPTY_ORIGINS();
  const pending: BurnedGroup = { totalMinor: 0, count: 0 };
  const fiscalized: BurnedGroup = { totalMinor: 0, count: 0 };
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

    const origin = byOrigin[row.method ?? "unknown"];
    origin.totalMinor += burned;
    origin.count += 1;

    const bucket = row.fiscalized ? fiscalized : pending;
    bucket.totalMinor += burned;
    bucket.count += 1;
  }

  const byDay = Array.from(perDay.entries())
    .map(([dayKey, v]) => ({ dayKey, ...v }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return { totalMinor, count, byDay, byOrigin, pending, fiscalized };
}

/**
 * Why a deposit was kept, in the words the drill-down shows.
 *
 * The booking's own status is the whole answer: the two ways a deposit is
 * burned are the two ways a spot goes unused. `cancelled` here always means a
 * late cancel — a timely one never burns anything, so a cancelled booking with
 * money on it was cancelled inside the studio's window.
 */
export type BurnReason = "no_show" | "late_cancel" | "unknown";

export function burnReason(status: string): BurnReason {
  if (status === "no_show") return "no_show";
  if (status === "cancelled") return "late_cancel";
  return "unknown";
}

export const BURN_REASON_LABEL: Record<BurnReason, string> = {
  no_show: "Неявяване",
  late_cancel: "Отказ след срока",
  unknown: "Усвоен от администратор",
};
