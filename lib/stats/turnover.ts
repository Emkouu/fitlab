import { BookingStatus } from "@/lib/generated/prisma/enums";
import { sofiaDateKey } from "@/lib/format";

/**
 * Turnover („оборот") — money that actually reached the studio, per Sofia day.
 *
 * Two sources, and only two, because they are the only money the app sees:
 *  - **deposits** — `DepositEntry` rows: `received` in, `returned` out (card
 *    refunds, cash handed back). Dated by when the entry was recorded. Manual
 *    corrections are not money and are left out by the caller.
 *  - **class fees paid in cash** — an `attended` booking whose `onsiteMethod`
 *    is `cash`, at `classPriceMinor()`. Dated by the class day.
 *
 * Subscription and Multisport are counted, not valued: that money is settled
 * outside the app (the pass was sold separately, the partner pays later).
 *
 * Bookings are deliberately NOT money. The deposit is a one-off guarantee that
 * booking never debits — the old rule („balance → debited at booking time")
 * counted €10 per booking that never changed hands.
 */

export type TurnoverBookingRow = {
  status: BookingStatus;
  /** `Booking.onsiteMethod` — NULL, a class-fee method, or a legacy value. */
  onsiteMethod: string | null;
  /** Final class price, already resolved through `classPriceMinor()`. */
  priceMinor: number;
  classStartAt: Date;
};

export type TurnoverDepositRow = {
  /** Signed EUR cents: positive received, negative returned. */
  amountMinor: number;
  createdAt: Date;
};

export type DayStats = {
  /** Sofia-local "YYYY-MM-DD" key. */
  dayKey: string;
  /** depositsMinor + cashFeesMinor. */
  turnoverMinor: number;
  /** Deposits received minus returned that day. */
  depositsMinor: number;
  /** Class fees paid in cash on that day's classes. */
  cashFeesMinor: number;
  /** All non-cancelled bookings on that day's classes. */
  bookings: number;
  attended: number;
  noShows: number;
  subscription: number;
  multisport: number;
};

const emptyDay = (dayKey: string): DayStats => ({
  dayKey,
  turnoverMinor: 0,
  depositsMinor: 0,
  cashFeesMinor: 0,
  bookings: 0,
  attended: 0,
  noShows: 0,
  subscription: 0,
  multisport: 0,
});

/** Per-day stats, newest day first. Only days with something on them appear. */
export function dailyStats(
  bookings: readonly TurnoverBookingRow[],
  deposits: readonly TurnoverDepositRow[] = [],
): DayStats[] {
  const byDay = new Map<string, DayStats>();
  const day = (key: string) => {
    let d = byDay.get(key);
    if (!d) byDay.set(key, (d = emptyDay(key)));
    return d;
  };

  for (const b of bookings) {
    if (b.status === BookingStatus.cancelled) continue;
    const d = day(sofiaDateKey(b.classStartAt));
    d.bookings += 1;
    if (b.status === BookingStatus.no_show) d.noShows += 1;
    if (b.status !== BookingStatus.attended) continue;
    d.attended += 1;
    if (b.onsiteMethod === "cash") d.cashFeesMinor += b.priceMinor;
    else if (b.onsiteMethod === "subscription") d.subscription += 1;
    else if (b.onsiteMethod === "multisport") d.multisport += 1;
  }

  for (const e of deposits) {
    if (!Number.isFinite(e.amountMinor) || e.amountMinor === 0) continue;
    day(sofiaDateKey(e.createdAt)).depositsMinor += e.amountMinor;
  }

  for (const d of byDay.values()) d.turnoverMinor = d.depositsMinor + d.cashFeesMinor;

  return Array.from(byDay.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

/** Sum of per-day stats — the month's (or any period's) totals. */
export function sumDays(days: readonly DayStats[]): DayStats {
  const total = emptyDay("");
  for (const d of days) {
    total.turnoverMinor += d.turnoverMinor;
    total.depositsMinor += d.depositsMinor;
    total.cashFeesMinor += d.cashFeesMinor;
    total.bookings += d.bookings;
    total.attended += d.attended;
    total.noShows += d.noShows;
    total.subscription += d.subscription;
    total.multisport += d.multisport;
  }
  return total;
}
