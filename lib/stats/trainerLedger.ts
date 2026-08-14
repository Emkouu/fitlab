/**
 * Per-trainer ledger for one month — who taught what, who turned up, and how
 * the class fee was settled.
 *
 * The class fee is always paid in the room, so the only record that it changed
 * hands is what staff tap in Attendance: `attended` plus a method on
 * `Booking.onsiteMethod`. That makes two situations worth seeing at a glance,
 * and neither is visible from turnover:
 *
 *   `unrecorded` — marked as attended, but no payment method recorded. The
 *                  person trained and nothing says how they paid.
 *   `unmarked`   — the class has been and gone and the booking was never
 *                  resolved at all: not attended, not a no-show.
 *
 * Both are ordinary human forgetfulness most of the time. They are also exactly
 * what taking cash off the books looks like, which is why they are counted
 * rather than quietly folded into „attended".
 *
 * Money is deliberately narrow: `cashMinor` counts only attended bookings whose
 * method is `cash`, at that class's own resolved price. Subscription and
 * Multisport visits are counted, not valued — no cash passes through anyone's
 * hands, so putting a euro figure on them would only blur the number that
 * matters.
 *
 * A class with two trainers counts in full for both. There is no rule in the
 * data for splitting a class between them, and inventing one (halves? the first
 * name?) would produce a number nobody could check. So per-trainer figures are
 * „what happened in this trainer's classes", and summing across trainers can
 * exceed the studio total — by design, and stated on screen.
 */

import { BookingStatus } from "@/lib/generated/prisma/enums";
import { isClassFeeMethod, type ClassFeeMethod } from "@/lib/payments/classFeeMethods";

export type LedgerClass = {
  id: string;
  /** Trainers assigned to the class; may be empty, may hold two. */
  trainerIds: readonly string[];
  /** Final class price in EUR cents, already resolved via `classPriceMinor()`. */
  priceMinor: number;
};

export type LedgerBooking = {
  classId: string;
  status: BookingStatus;
  /** `Booking.onsiteMethod` — NULL, a known method, or a legacy value. */
  onsiteMethod: string | null;
};

/** The counted columns, shared by the per-trainer and per-class views. */
export type LedgerCounts = {
  /** Bookings that reached a resolved state, plus the two that did not. */
  attended: number;
  noShows: number;
  /** Attended, but with no recognised payment method on the booking. */
  unrecorded: number;
  /** Never resolved: still booked/paid/pending when the class was over. */
  unmarked: number;
  /** Attended bookings per method. */
  byMethod: Record<ClassFeeMethod, number>;
  /** Cash that should have been collected, in EUR cents. */
  cashMinor: number;
};

export type TrainerLedgerEntry = LedgerCounts & {
  trainerId: string;
  /** Classes assigned to this trainer in the period, cancelled ones excluded
   *  by the caller's query. */
  classes: number;
};

export type ClassLedgerEntry = LedgerCounts & { classId: string };

function emptyCounts(): LedgerCounts {
  return {
    attended: 0,
    noShows: 0,
    unrecorded: 0,
    unmarked: 0,
    byMethod: { subscription: 0, cash: 0, multisport: 0 },
    cashMinor: 0,
  };
}

/**
 * Fold one booking into a counter. The single place the rules live, so the
 * per-trainer and per-class views can never drift apart.
 */
function countBooking(
  counts: LedgerCounts,
  booking: LedgerBooking,
  priceMinor: number,
): void {
  if (booking.status === BookingStatus.no_show) {
    counts.noShows += 1;
    return;
  }
  if (UNRESOLVED.includes(booking.status)) {
    counts.unmarked += 1;
    return;
  }
  if (booking.status !== BookingStatus.attended) return; // cancelled

  counts.attended += 1;
  if (!isClassFeeMethod(booking.onsiteMethod)) {
    counts.unrecorded += 1;
    return;
  }
  counts.byMethod[booking.onsiteMethod] += 1;
  if (booking.onsiteMethod === "cash") counts.cashMinor += priceMinor;
}

/** Statuses that mean „this booking was never resolved by staff". */
const UNRESOLVED: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.paid,
  BookingStatus.pending_deposit,
];

/**
 * Aggregate bookings per trainer.
 *
 * Classes are passed separately from bookings so a class nobody booked still
 * shows up as a class taught — an empty class is a fact about the month, not an
 * absence of one.
 *
 * Bookings whose `classId` is not in `classes` are ignored: the caller scoped
 * both to the same month, and a stray row would otherwise be attributed to no
 * trainer at all while still moving the totals.
 */
export function trainerLedger(input: {
  classes: readonly LedgerClass[];
  bookings: readonly LedgerBooking[];
}): TrainerLedgerEntry[] {
  const byId = new Map<string, TrainerLedgerEntry>();
  const entryFor = (trainerId: string): TrainerLedgerEntry => {
    let e = byId.get(trainerId);
    if (!e) {
      e = { trainerId, classes: 0, ...emptyCounts() };
      byId.set(trainerId, e);
    }
    return e;
  };

  const classesById = new Map<string, LedgerClass>();
  for (const cls of input.classes) {
    classesById.set(cls.id, cls);
    for (const trainerId of cls.trainerIds) entryFor(trainerId).classes += 1;
  }

  for (const booking of input.bookings) {
    const cls = classesById.get(booking.classId);
    if (!cls) continue;
    for (const trainerId of cls.trainerIds) {
      countBooking(entryFor(trainerId), booking, cls.priceMinor);
    }
  }

  return Array.from(byId.values());
}

/**
 * The same counting, one row per class — the drill-down behind a trainer's
 * month. Every class in `classes` comes back, including ones nobody booked.
 */
export function classLedger(input: {
  classes: readonly LedgerClass[];
  bookings: readonly LedgerBooking[];
}): ClassLedgerEntry[] {
  const byClass = new Map<string, ClassLedgerEntry>();
  const priceById = new Map<string, number>();
  for (const cls of input.classes) {
    byClass.set(cls.id, { classId: cls.id, ...emptyCounts() });
    priceById.set(cls.id, cls.priceMinor);
  }

  for (const booking of input.bookings) {
    const entry = byClass.get(booking.classId);
    if (!entry) continue;
    countBooking(entry, booking, priceById.get(booking.classId) ?? 0);
  }

  return Array.from(byClass.values());
}

/** The studio-wide totals of the same month, for the „от тях" line. */
export function trainerLedgerTotals(entries: readonly TrainerLedgerEntry[]) {
  return entries.reduce(
    (acc, e) => ({
      attended: acc.attended + e.attended,
      noShows: acc.noShows + e.noShows,
      unrecorded: acc.unrecorded + e.unrecorded,
      unmarked: acc.unmarked + e.unmarked,
      cashMinor: acc.cashMinor + e.cashMinor,
    }),
    { attended: 0, noShows: 0, unrecorded: 0, unmarked: 0, cashMinor: 0 },
  );
}
