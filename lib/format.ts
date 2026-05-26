/**
 * Server-safe date formatters that always render in Europe/Sofia, regardless
 * of the host server's TZ. UTC instants come out of Postgres; we format them
 * back to Sofia local for display.
 */

const DAY_LONG = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_HHMM = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Sofia",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "понеделник, 26.05.2026" */
export function formatSofiaDay(d: Date): string {
  return DAY_LONG.format(d);
}

/** "08:00" */
export function formatSofiaTime(d: Date): string {
  return TIME_HHMM.format(d);
}

/** "2026-05-26" — stable key for grouping. */
export function sofiaDateKey(d: Date): string {
  return DAY_KEY.format(d);
}
