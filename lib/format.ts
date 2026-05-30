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

/**
 * Seven "YYYY-MM-DD" Sofia-local dates: Monday → Sunday of the calendar week
 * that contains "now". Currently used by the seed to anchor demo data to the
 * current week.
 */
export function sofiaCurrentWeekDates(): string[] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Sofia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const dayOffsetFromMon: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const offset = dayOffsetFromMon[parts.weekday] ?? 0;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);

  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - offset + i));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

/* ─── Money ─────────────────────────────────────────────────────────────── */

// Bulgarian locale formats the EUR symbol after the value with a space:
// "20,00 €" — matches how the audience sees prices in BG.
const EUR_FMT = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
});

/** 2000 → "20,00 €". Input is EUR cents (ScheduledClass.depositAmount shape). */
export function formatEurMinor(minor: number): string {
  return EUR_FMT.format(minor / 100);
}
