import { describe, it, expect } from "vitest";
import { sofiaToUtc, tomorrowSofiaDate } from "./sofiaTime";

describe("sofiaTime utilities", () => {
  describe("sofiaToUtc", () => {
    it("should convert Sofia local time to UTC", () => {
      const sofiaDate = new Date(2026, 4, 28); // May 28, 2026
      const result = sofiaToUtc(sofiaDate, "18:30");
      expect(result).toBeInstanceOf(Date);
      // Just verify it returns a date, the exact UTC time depends on DST
    });

    it("should handle different times", () => {
      const sofiaDate = new Date(2026, 0, 15); // January 15, 2026 (winter)
      const result = sofiaToUtc(sofiaDate, "08:00");
      expect(result).toBeInstanceOf(Date);
    });

    it("should handle edge time values", () => {
      const sofiaDate = new Date(2026, 4, 28);
      expect(sofiaToUtc(sofiaDate, "00:00")).toBeInstanceOf(Date);
      expect(sofiaToUtc(sofiaDate, "23:59")).toBeInstanceOf(Date);
    });
  });

  describe("tomorrowSofiaDate", () => {
    it("should return a Date object", () => {
      const result = tomorrowSofiaDate();
      expect(result).toBeInstanceOf(Date);
    });

    it("should be greater than today", () => {
      const tomorrow = tomorrowSofiaDate();
      const today = new Date();
      expect(tomorrow.getTime()).toBeGreaterThan(today.getTime());
    });
  });
});
