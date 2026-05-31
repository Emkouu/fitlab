/**
 * Generate the list of "YYYY-MM-DD" dates between `startDate` and `endDate`
 * (inclusive) that fall on one of the selected `weekdays`.
 *
 * Weekday encoding: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun.
 * Dates are treated as plain calendar dates (no timezone math) — iteration
 * uses UTC to avoid DST landmines.
 */
export function generateRecurringDates(
  startDate: string,
  endDate: string,
  weekdays: number[],
): string[] {
  if (!weekdays.length) return [];

  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  if (!sy || !ey) return [];

  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  if (end < start) return [];

  const wanted = new Set(weekdays);
  const out: string[] = [];
  const ONE_DAY = 24 * 60 * 60 * 1000;

  for (let t = start; t <= end; t += ONE_DAY) {
    const d = new Date(t);
    // getUTCDay: 0=Sun..6=Sat. Convert to 0=Mon..6=Sun.
    const iso = (d.getUTCDay() + 6) % 7;
    if (wanted.has(iso)) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      out.push(`${yyyy}-${mm}-${dd}`);
    }
  }
  return out;
}
