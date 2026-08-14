import { describe, expect, it } from "vitest";
import {
  formatMonthKeyBg,
  isMonthKey,
  monthKeyOf,
  shiftMonthKey,
  sofiaMonthRange,
} from "./monthRange";

describe("monthKeyOf", () => {
  it("takes the month out of a Sofia day key", () => {
    expect(monthKeyOf("2026-08-13")).toBe("2026-08");
  });
});

describe("shiftMonthKey", () => {
  it("steps within a year", () => {
    expect(shiftMonthKey("2026-08", 1)).toBe("2026-09");
    expect(shiftMonthKey("2026-08", -1)).toBe("2026-07");
  });

  it("rolls over the year boundary in both directions", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("survives a jump of more than a year", () => {
    expect(shiftMonthKey("2026-08", 14)).toBe("2027-10");
    expect(shiftMonthKey("2026-08", -20)).toBe("2024-12");
  });
});

describe("isMonthKey", () => {
  it("accepts a well-formed key", () => {
    expect(isMonthKey("2026-08")).toBe(true);
    expect(isMonthKey("2026-12")).toBe(true);
    expect(isMonthKey("2026-01")).toBe(true);
  });

  it("rejects anything a query string could otherwise smuggle in", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-8")).toBe(false);
    expect(isMonthKey("2026-08-13")).toBe(false);
    expect(isMonthKey("")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
    expect(isMonthKey(202608)).toBe(false);
  });
});

describe("sofiaMonthRange", () => {
  it("covers a summer month from Sofia midnight to Sofia midnight (UTC+3)", () => {
    const { from, to } = sofiaMonthRange("2026-08");
    expect(from.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("covers a winter month at UTC+2", () => {
    const { from, to } = sofiaMonthRange("2026-01");
    expect(from.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-31T22:00:00.000Z");
  });

  it("follows the DST switch inside a month that contains it", () => {
    // Sofia moves to summer time on the last Sunday of March.
    const { from, to } = sofiaMonthRange("2026-03");
    expect(from.toISOString()).toBe("2026-02-28T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-31T21:00:00.000Z");
  });

  it("hands the boundary instant to the later month, never to both", () => {
    const august = sofiaMonthRange("2026-08");
    const september = sofiaMonthRange("2026-09");
    expect(august.to.toISOString()).toBe(september.from.toISOString());

    // A class at Sofia 23:30 on 31.08 belongs to August, not September.
    const lateAugust = new Date("2026-08-31T20:30:00.000Z");
    expect(lateAugust >= august.from && lateAugust < august.to).toBe(true);
    expect(lateAugust >= september.from).toBe(false);
  });

  it("rolls the year over", () => {
    const { from, to } = sofiaMonthRange("2026-12");
    expect(from.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });
});

describe("formatMonthKeyBg", () => {
  it("renders the Bulgarian month name", () => {
    expect(formatMonthKeyBg("2026-08")).toBe("август 2026");
    expect(formatMonthKeyBg("2026-01")).toBe("януари 2026");
    expect(formatMonthKeyBg("2026-12")).toBe("декември 2026");
  });
});
