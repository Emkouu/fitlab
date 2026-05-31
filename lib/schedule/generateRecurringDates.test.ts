import { describe, it, expect } from "vitest";
import { generateRecurringDates } from "./generateRecurringDates";

describe("generateRecurringDates", () => {
  it("returns all Mondays in June 2026 when weekday=Mon", () => {
    // June 2026: Mondays are 01, 08, 15, 22, 29
    const result = generateRecurringDates("2026-06-01", "2026-06-30", [0]);
    expect(result).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
  });

  it("includes the start date when it matches a selected weekday", () => {
    // 2026-06-01 is a Monday
    const result = generateRecurringDates("2026-06-01", "2026-06-08", [0]);
    expect(result[0]).toBe("2026-06-01");
  });

  it("returns Mon+Wed dates in correct order", () => {
    // June 2026: Mon=01,08,15  Wed=03,10,17
    const result = generateRecurringDates("2026-06-01", "2026-06-17", [0, 2]);
    expect(result).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-08",
      "2026-06-10",
      "2026-06-15",
      "2026-06-17",
    ]);
  });

  it("returns empty array when end date is before start", () => {
    expect(
      generateRecurringDates("2026-06-10", "2026-06-01", [0, 1, 2, 3, 4]),
    ).toEqual([]);
  });

  it("returns empty array when no weekdays selected", () => {
    expect(generateRecurringDates("2026-06-01", "2026-06-30", [])).toEqual([]);
  });

  it("handles single-day range where start matches", () => {
    // 2026-06-07 is a Sunday (weekday=6)
    expect(generateRecurringDates("2026-06-07", "2026-06-07", [6])).toEqual([
      "2026-06-07",
    ]);
  });

  it("handles single-day range where start does not match", () => {
    expect(generateRecurringDates("2026-06-07", "2026-06-07", [0])).toEqual([]);
  });
});
