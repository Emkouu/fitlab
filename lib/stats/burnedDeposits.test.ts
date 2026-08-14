import { describe, expect, it } from "vitest";
import { burnedDepositTotals } from "./burnedDeposits";

const row = (depositBurnedMinor: number | null, classDayKey = "2026-08-13") => ({
  depositBurnedMinor,
  classDayKey,
});

describe("burnedDepositTotals", () => {
  it("sums what was actually burned", () => {
    const r = burnedDepositTotals([row(1000), row(1000), row(2000)]);
    expect(r.totalMinor).toBe(4000);
    expect(r.count).toBe(3);
  });

  it("ignores bookings that never burned anything", () => {
    const r = burnedDepositTotals([row(null), row(1000), row(null)]);
    expect(r).toMatchObject({ totalMinor: 1000, count: 1 });
  });

  it("treats a stored 0 as no burn, not as a burn of nothing", () => {
    // A corrected no_show clears the claim; a zero must not inflate the count.
    const r = burnedDepositTotals([row(0), row(1000)]);
    expect(r).toMatchObject({ totalMinor: 1000, count: 1 });
  });

  it("keeps amounts that differ because the setting changed between them", () => {
    // €10 burned before the studio raised the deposit, €20 after.
    const r = burnedDepositTotals([row(1000), row(2000)]);
    expect(r.totalMinor).toBe(3000);
  });

  it("groups by Sofia day, ascending", () => {
    const r = burnedDepositTotals([
      row(1000, "2026-08-20"),
      row(2000, "2026-08-03"),
      row(500, "2026-08-20"),
    ]);
    expect(r.byDay).toEqual([
      { dayKey: "2026-08-03", totalMinor: 2000, count: 1 },
      { dayKey: "2026-08-20", totalMinor: 1500, count: 2 },
    ]);
  });

  it("returns an empty report for a month with no burns", () => {
    expect(burnedDepositTotals([])).toEqual({
      totalMinor: 0,
      count: 0,
      byDay: [],
    });
  });

  it("never lets a day with no burn into the breakdown", () => {
    const r = burnedDepositTotals([row(null, "2026-08-01"), row(1000, "2026-08-02")]);
    expect(r.byDay.map((d) => d.dayKey)).toEqual(["2026-08-02"]);
  });
});
