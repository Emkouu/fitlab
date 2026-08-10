import { BookingSource, BookingStatus } from "@/lib/generated/prisma/enums";
import { sofiaDateKey } from "@/lib/format";

/**
 * Daily turnover („дневен оборот") — deposits the studio has actually
 * received, grouped by the Sofia-local day the class takes place.
 *
 * A booking counts toward turnover when the money side has settled:
 *  - card    → `paid` (webhook confirmed) and the later `attended`/`no_show`
 *              (a card booking only reaches those after being paid);
 *              a bare `booked` card hold has no money yet.
 *  - balance → debited the moment the booking is created, so every
 *              non-cancelled status counts (`booked`/`attended`/`no_show`).
 *  - onsite  → cash changes hands at the studio; count it once attendance is
 *              resolved (`attended`/`no_show`); `pending_deposit` is a promise.
 */
export type TurnoverBookingRow = {
  status: BookingStatus;
  source: BookingSource;
  /** Deposit in minor units (EUR cents), already resolved by the caller through
   *  `depositAmountMinor()` — never the raw `ScheduledClass.depositAmount`
   *  column, which is NULL whenever the class inherits the studio setting. */
  depositMinor: number;
  /** Class start instant (UTC from Postgres). */
  classStartAt: Date;
};

export type DayStats = {
  /** Sofia-local "YYYY-MM-DD" key. */
  dayKey: string;
  /** Received deposits, minor units. */
  turnoverMinor: number;
  /** All non-cancelled bookings on that day's classes. */
  bookings: number;
  attended: number;
  noShows: number;
};

const CARD_SETTLED: BookingStatus[] = [
  BookingStatus.paid,
  BookingStatus.attended,
  BookingStatus.no_show,
];
const BALANCE_SETTLED: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.attended,
  BookingStatus.no_show,
];
const ONSITE_SETTLED: BookingStatus[] = [
  BookingStatus.attended,
  BookingStatus.no_show,
];

export function countsTowardTurnover(b: {
  status: BookingStatus;
  source: BookingSource;
}): boolean {
  switch (b.source) {
    case BookingSource.card:
      return CARD_SETTLED.includes(b.status);
    case BookingSource.balance:
      return BALANCE_SETTLED.includes(b.status);
    case BookingSource.onsite_deposit:
      return ONSITE_SETTLED.includes(b.status);
  }
}

/**
 * Group booking rows into per-day stats (Sofia days), newest day first.
 * Cancelled bookings must be filtered out by the caller's query; they are
 * additionally ignored here for safety.
 */
export function dailyStats(rows: TurnoverBookingRow[]): DayStats[] {
  const byDay = new Map<string, DayStats>();

  for (const row of rows) {
    if (row.status === BookingStatus.cancelled) continue;

    const dayKey = sofiaDateKey(row.classStartAt);
    let day = byDay.get(dayKey);
    if (!day) {
      day = { dayKey, turnoverMinor: 0, bookings: 0, attended: 0, noShows: 0 };
      byDay.set(dayKey, day);
    }

    day.bookings += 1;
    if (row.status === BookingStatus.attended) day.attended += 1;
    if (row.status === BookingStatus.no_show) day.noShows += 1;
    if (countsTowardTurnover(row)) day.turnoverMinor += row.depositMinor;
  }

  return Array.from(byDay.values()).sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey),
  );
}
