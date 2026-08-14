/**
 * Sofia calendar months, for the monthly reports in the admin panel.
 *
 * A month is a *Sofia* month, not a UTC one: „август" ends at Sofia midnight on
 * 01.09, which is 21:00 UTC on 31.08 in summer and 22:00 UTC in winter. Getting
 * this wrong moves a late evening class — and the money on it — into the
 * neighbouring month's report.
 *
 * Month keys are "YYYY-MM", which sort lexicographically, same idea as the
 * "YYYY-MM-DD" day keys in `lib/format`.
 */

import { sofiaToUtc, todaySofiaDateKey } from "@/lib/format/sofiaTime";

/** "2026-08" — the Sofia month a given day key belongs to. */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The Sofia month we are in right now. */
export function currentMonthKey(): string {
  return monthKeyOf(todaySofiaDateKey());
}

/** "2026-08" + 1 → "2026-09"; −1 → "2026-07". Year rolls over correctly. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const zeroBased = (y * 12 + (m - 1)) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Is this a well-formed "YYYY-MM"? Guards the `?month=` query parameter. */
export function isMonthKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }
  return true;
}

/**
 * Half-open UTC range covering the Sofia month: `startAt >= from && < to`.
 *
 * Half-open on purpose — an inclusive end would need "the last instant of the
 * month", which does not exist at any useful precision.
 */
export function sofiaMonthRange(monthKey: string): { from: Date; to: Date } {
  return {
    from: firstInstantOf(monthKey),
    to: firstInstantOf(shiftMonthKey(monthKey, 1)),
  };
}

/** Sofia 00:00 on the 1st of that month, as a UTC instant. */
function firstInstantOf(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  // Noon UTC lands on the intended Sofia calendar date year-round; sofiaToUtc
  // then reads that date's real offset and returns Sofia 00:00 as UTC.
  return sofiaToUtc(new Date(Date.UTC(y, m - 1, 1, 12)), "00:00");
}

const MONTH_NAMES_BG = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];

/** "2026-08" → „август 2026" for headings. */
export function formatMonthKeyBg(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES_BG[m - 1]} ${y}`;
}
