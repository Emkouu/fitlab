import { describe, it, expect } from "vitest";
import {
  PUBLIC_WINDOW_DAYS,
  addDaysToKey,
  isWithinPublicWindow,
  publicWindowDayKeys,
  publicWindowEndExclusive,
  publicWindowEndKey,
} from "./publicWindow";

describe("publicWindow", () => {
  it("spans 7 distinct days starting today", () => {
    const keys = publicWindowDayKeys("2026-08-07"); // Friday
    expect(keys).toHaveLength(PUBLIC_WINDOW_DAYS);
    expect(keys[0]).toBe("2026-08-07");
    expect(keys.at(-1)).toBe("2026-08-13"); // next Thursday
  });

  it("never shows the same weekday twice", () => {
    const keys = publicWindowDayKeys("2026-08-08"); // Saturday
    const weekdays = keys.map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    });
    expect(new Set(weekdays).size).toBe(7);
    // Saturday → last visible day is Friday, not "the other Saturday".
    expect(publicWindowEndKey("2026-08-08")).toBe("2026-08-14");
  });

  it("rolls across month and year boundaries", () => {
    expect(publicWindowEndKey("2026-08-29")).toBe("2026-09-04");
    expect(addDaysToKey("2026-12-30", 7)).toBe("2027-01-06");
  });

  it("includes today and the last day, excludes the day after", () => {
    const today = "2026-08-07";
    expect(isWithinPublicWindow("2026-08-07", today)).toBe(true);
    expect(isWithinPublicWindow("2026-08-13", today)).toBe(true);
    expect(isWithinPublicWindow("2026-08-14", today)).toBe(false);
    expect(isWithinPublicWindow("2026-08-06", today)).toBe(false);
  });

  it("ends at Sofia midnight of day 8 (summer, UTC+3)", () => {
    // 2026-08-07 + 7 = 2026-08-14; Sofia 00:00 EEST = 2026-08-13T21:00Z.
    expect(publicWindowEndExclusive("2026-08-07").toISOString()).toBe(
      "2026-08-13T21:00:00.000Z",
    );
  });

  it("ends at Sofia midnight of day 8 (winter, UTC+2)", () => {
    // 2026-01-07 + 7 = 2026-01-14; Sofia 00:00 EET = 2026-01-13T22:00Z.
    expect(publicWindowEndExclusive("2026-01-07").toISOString()).toBe(
      "2026-01-13T22:00:00.000Z",
    );
  });
});
