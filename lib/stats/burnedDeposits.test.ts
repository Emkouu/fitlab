import { describe, expect, it } from "vitest";
import { burnedDepositTotals, burnReason } from "./burnedDeposits";

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
    const empty = burnedDepositTotals([]);
    expect(empty.totalMinor).toBe(0);
    expect(empty.count).toBe(0);
    expect(empty.byDay).toEqual([]);
    expect(empty.pending).toEqual({ totalMinor: 0, count: 0 });
    expect(empty.byOrigin.cash).toEqual({ totalMinor: 0, count: 0 });
  });

  it("never lets a day with no burn into the breakdown", () => {
    const r = burnedDepositTotals([row(null, "2026-08-01"), row(1000, "2026-08-02")]);
    expect(r.byDay.map((d) => d.dayKey)).toEqual(["2026-08-02"]);
  });
});

describe("burnReason", () => {
  it("reads a no-show off the status", () => {
    expect(burnReason("no_show")).toBe("no_show");
  });

  it("treats a cancelled booking with a burn as a late cancel", () => {
    // A timely cancel never burns, so money on a cancelled booking means the
    // client cancelled inside the studio's window.
    expect(burnReason("cancelled")).toBe("late_cancel");
  });

  it("does not guess for any other status", () => {
    expect(burnReason("attended")).toBe("unknown");
    expect(burnReason("booked")).toBe("unknown");
  });
});

describe("burnedDepositTotals — за касовия апарат", () => {
  it("splits by how the client had originally paid", () => {
    const t = burnedDepositTotals([
      { depositBurnedMinor: 1000, classDayKey: "2026-08-03", method: "cash" },
      { depositBurnedMinor: 2000, classDayKey: "2026-08-04", method: "card" },
      { depositBurnedMinor: 1000, classDayKey: "2026-08-05", method: "cash" },
    ]);
    expect(t.byOrigin.cash).toEqual({ totalMinor: 2000, count: 2 });
    expect(t.byOrigin.card).toEqual({ totalMinor: 2000, count: 1 });
    expect(t.byOrigin.unknown).toEqual({ totalMinor: 0, count: 0 });
  });

  it("files a burn with no recorded origin under unknown rather than a key", () => {
    // Deposits recorded before the movements ledger existed. Guessing a key
    // would put the money in the wrong column on a fiscal receipt.
    const t = burnedDepositTotals([
      { depositBurnedMinor: 1000, classDayKey: "2026-08-03" },
      { depositBurnedMinor: 1000, classDayKey: "2026-08-04", method: null },
    ]);
    expect(t.byOrigin.unknown).toEqual({ totalMinor: 2000, count: 2 });
  });

  it("separates what still has to be rung up from what already was", () => {
    const t = burnedDepositTotals([
      { depositBurnedMinor: 1000, classDayKey: "2026-08-03", fiscalized: true },
      { depositBurnedMinor: 2000, classDayKey: "2026-08-04" },
    ]);
    expect(t.fiscalized).toEqual({ totalMinor: 1000, count: 1 });
    expect(t.pending).toEqual({ totalMinor: 2000, count: 1 });
    // Both are still burns — the fiscal state is a work list, not a filter.
    expect(t.totalMinor).toBe(3000);
  });

  it("splits what is still to be rung up per key", () => {
    const r = burnedDepositTotals([
      { depositBurnedMinor: 1000, classDayKey: "2026-09-01", method: "cash" },
      { depositBurnedMinor: 2000, classDayKey: "2026-09-02", method: "cash", fiscalized: true },
      { depositBurnedMinor: 1000, classDayKey: "2026-09-03", method: "card" },
    ]);
    expect(r.pendingByOrigin.cash).toEqual({ totalMinor: 1000, count: 1 });
    expect(r.pendingByOrigin.card).toEqual({ totalMinor: 1000, count: 1 });
    expect(r.fiscalized).toEqual({ totalMinor: 2000, count: 1 });
  });
});
