import { describe, expect, it } from "vitest";
import { buildBurnedReport, type BurnedReportInput } from "./burnedReport";

let seq = 0;
const row = (over: Partial<BurnedReportInput> = {}): BurnedReportInput => ({
  id: `b${++seq}`,
  status: "no_show",
  depositBurnedMinor: 1000,
  depositBurnedMethod: "cash",
  depositFiscalizedAt: null,
  depositFiscalizedMinor: null,
  clientName: "Мария",
  practiceName: "Пилатес",
  classStartAt: new Date("2026-09-10T07:00:00Z"),
  ...over,
});

describe("buildBurnedReport", () => {
  it("lists burns oldest class first", () => {
    const r = buildBurnedReport([
      row({ id: "late", classStartAt: new Date("2026-09-20T07:00:00Z") }),
      row({ id: "early", classStartAt: new Date("2026-09-02T07:00:00Z") }),
    ]);
    expect(r.lines.map((l) => l.id)).toEqual(["early", "late"]);
  });

  it("totals per register key and by fiscal state", () => {
    const r = buildBurnedReport([
      row({ depositBurnedMethod: "cash", depositBurnedMinor: 1000 }),
      row({
        depositBurnedMethod: "card",
        depositBurnedMinor: 2000,
        depositFiscalizedAt: new Date(),
        depositFiscalizedMinor: 2000,
      }),
      row({ depositBurnedMethod: null, depositBurnedMinor: 500 }),
    ]);
    expect(r.totalMinor).toBe(3500);
    expect(r.count).toBe(3);
    expect(r.byOrigin.cash).toEqual({ totalMinor: 1000, count: 1 });
    expect(r.byOrigin.card).toEqual({ totalMinor: 2000, count: 1 });
    expect(r.byOrigin.unknown).toEqual({ totalMinor: 500, count: 1 });
    expect(r.fiscalized).toEqual({ totalMinor: 2000, count: 1 });
    expect(r.pending).toEqual({ totalMinor: 1500, count: 2 });
  });

  it("uses the burned amount, not anything else", () => {
    const r = buildBurnedReport([row({ depositBurnedMinor: 1234 })]);
    expect(r.lines[0].amountMinor).toBe(1234);
  });

  it("puts a restored burn that was already rung up under сторно, at the printed amount", () => {
    const r = buildBurnedReport([
      row({
        status: "attended",
        depositBurnedMinor: null,
        depositFiscalizedAt: new Date(),
        depositFiscalizedMinor: 1000,
      }),
    ]);
    expect(r.lines).toHaveLength(0);
    expect(r.totalMinor).toBe(0);
    expect(r.storno).toHaveLength(1);
    expect(r.stornoTotalMinor).toBe(1000);
  });

  it("drops rows with nothing burned and nothing printed", () => {
    const r = buildBurnedReport([row({ depositBurnedMinor: 0 }), row({ depositBurnedMinor: null })]);
    expect(r.lines).toHaveLength(0);
    expect(r.storno).toHaveLength(0);
  });

  it("names the reason and never leaves the client blank", () => {
    const r = buildBurnedReport([row({ status: "cancelled", clientName: "  " })]);
    expect(r.lines[0].reason).toBe("late_cancel");
    expect(r.lines[0].clientName).toBe("Без име");
  });
});
