/**
 * Public schedule visibility window.
 *
 * Staff plan the schedule a whole month ahead, but clients only ever see a
 * rolling 7-day slice: today plus the next 6 Sofia days. Every weekday appears
 * exactly once inside that slice, so nobody can look at „събота", book, and
 * land on *next* week's Saturday by mistake.
 *
 * All boundaries are Sofia-local calendar days ("YYYY-MM-DD" keys), converted
 * to UTC instants only where Prisma needs one.
 */

import { sofiaToUtc, todaySofiaDateKey } from "@/lib/format/sofiaTime";

/** Number of Sofia days visible to clients, counting today. */
export const PUBLIC_WINDOW_DAYS = 7;

/** "2026-08-01" + 3 → "2026-08-04". Plain calendar math, no timezone. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Last Sofia day clients can see — today + 6. */
export function publicWindowEndKey(todayKey: string = todaySofiaDateKey()): string {
  return addDaysToKey(todayKey, PUBLIC_WINDOW_DAYS - 1);
}

/** Every Sofia day key inside the window, today first. */
export function publicWindowDayKeys(
  todayKey: string = todaySofiaDateKey(),
): string[] {
  return Array.from({ length: PUBLIC_WINDOW_DAYS }, (_, i) =>
    addDaysToKey(todayKey, i),
  );
}

/**
 * Exclusive upper bound as a UTC instant: Sofia midnight opening the day right
 * after the window. Use as `startAt: { lt: publicWindowEndExclusive() }` so the
 * whole of the last visible day is included, DST or not.
 */
export function publicWindowEndExclusive(
  todayKey: string = todaySofiaDateKey(),
): Date {
  const key = addDaysToKey(todayKey, PUBLIC_WINDOW_DAYS);
  const [y, m, d] = key.split("-").map(Number);
  // Noon UTC lands on the intended Sofia calendar date year-round; sofiaToUtc
  // then reads that date's real offset and returns Sofia 00:00 as UTC.
  return sofiaToUtc(new Date(Date.UTC(y, m - 1, d, 12)), "00:00");
}

/** Is this Sofia day key visible to clients right now? */
export function isWithinPublicWindow(
  key: string,
  todayKey: string = todaySofiaDateKey(),
): boolean {
  return key >= todayKey && key <= publicWindowEndKey(todayKey);
}
