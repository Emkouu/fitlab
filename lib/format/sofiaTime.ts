/**
 * Convert a Sofia local date + time to UTC Date object.
 * Uses Intl.DateTimeFormat to read Sofia's offset at that specific instant,
 * automatically handling DST transitions (EET UTC+2 winter, EEST UTC+3 summer).
 */

/**
 * Convert a Sofia local date + time string (HH:mm) to a UTC Date.
 *
 * @param sofiaDate - A Date object representing the Sofia local calendar date (time components ignored)
 * @param timeHHmm - Time string in "HH:mm" format (e.g., "18:30")
 * @returns A Date object representing that moment in UTC
 *
 * @example
 * sofiaToUtc(new Date(2026, 4, 28), "18:30")
 * // Returns Date object representing 2026-05-28 18:30 Sofia time in UTC
 */
export function sofiaToUtc(sofiaDate: Date, timeHHmm: string): Date {
  // Extract date components in Sofia timezone
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Sofia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(sofiaDate)
      .map((p) => [p.type, p.value]),
  );

  const [hours, minutes] = timeHHmm.split(":").map(Number);

  // Build the local ISO string with the provided time
  const localISO = `${parts.year}-${parts.month}-${parts.day} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  // Use the same technique as prisma/seed.ts:
  // Create a placeholder UTC date from the wall clock string
  const placeholder = new Date(`${localISO.replace(" ", "T")}:00Z`);

  // Get what the placeholder date looks like when formatted in Sofia timezone
  const sofiaFormatted = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Sofia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(placeholder)
      .map((p) => [p.type, p.value]),
  );

  // Handle edge case where hour might be "24"
  const hour = sofiaFormatted.hour === "24" ? "00" : sofiaFormatted.hour;

  // Build what the UTC ms would be if the Sofia formatted time were actually UTC
  const sofiaWallAsUtcMs = Date.UTC(
    Number(sofiaFormatted.year),
    Number(sofiaFormatted.month) - 1,
    Number(sofiaFormatted.day),
    Number(hour),
    Number(sofiaFormatted.minute),
    Number(sofiaFormatted.second),
  );

  // The difference between what we said (placeholder) and what Sofia showed us
  // is the offset. Subtract it to get the true UTC time.
  const offsetMs = sofiaWallAsUtcMs - placeholder.getTime();
  return new Date(placeholder.getTime() - offsetMs);
}

/**
 * Get tomorrow's date in Sofia timezone as a Date object at midnight UTC.
 * Useful for validation against "must be in the future" rules.
 *
 * @returns A Date object representing tomorrow in Sofia (at midnight UTC)
 *
 * @example
 * tomorrowSofiaDate()
 * // Returns Date for 2026-05-29 00:00:00 UTC (which is 2026-05-29 in Sofia)
 */
export function tomorrowSofiaDate(): Date {
  // Get today's date in Sofia as "YYYY-MM-DD"
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Sofia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );

  const [y, m, d] = [parts.year, parts.month, parts.day].map(Number);

  // Add one day using UTC arithmetic on plain dates
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return tomorrow;
}
