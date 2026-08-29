import { describe, expect, it } from "vitest";
import {
  receivedDepositTotals,
  type ReceivedDepositRow,
} from "./receivedDeposits";

const row = (
  amountMinor: number,
  method: ReceivedDepositRow["method"] = "cash",
): ReceivedDepositRow => ({ amountMinor, method });

describe("receivedDepositTotals", () => {
  it("is empty for no rows", () => {
    const t = receivedDepositTotals([]);
    expect(t.receivedMinor).toBe(0);
    expect(t.receivedCount).toBe(0);
    expect(t.netMinor).toBe(0);
  });

  it("counts a cash deposit recorded at the desk", () => {
    const t = receivedDepositTotals([row(1000, "cash")]);
    expect(t.receivedMinor).toBe(1000);
    expect(t.receivedCount).toBe(1);
    expect(t.receivedByMethod.cash).toEqual({ totalMinor: 1000, count: 1 });
    expect(t.receivedByMethod.card).toEqual({ totalMinor: 0, count: 0 });
  });

  it("splits cash and card without mixing them", () => {
    const t = receivedDepositTotals([
      row(1000, "cash"),
      row(2000, "card"),
      row(1000, "cash"),
    ]);
    expect(t.receivedMinor).toBe(4000);
    expect(t.receivedByMethod.cash).toEqual({ totalMinor: 2000, count: 2 });
    expect(t.receivedByMethod.card).toEqual({ totalMinor: 2000, count: 1 });
  });

  it("subtracts what was given back, and reports it separately", () => {
    const t = receivedDepositTotals([row(1000, "card"), row(-1000, "card")]);
    expect(t.receivedMinor).toBe(1000);
    expect(t.returnedMinor).toBe(1000);
    expect(t.returnedCount).toBe(1);
    expect(t.netMinor).toBe(0);
    // A refund never counts as an incoming card deposit.
    expect(t.receivedByMethod.card).toEqual({ totalMinor: 1000, count: 1 });
  });

  it("keeps the amount the client actually paid, not today's setting", () => {
    // €10 paid before the studio raised the deposit, €20 after.
    const t = receivedDepositTotals([row(1000, "cash"), row(2000, "cash")]);
    expect(t.receivedMinor).toBe(3000);
  });

  it("ignores zero movements", () => {
    const t = receivedDepositTotals([row(0, "cash"), row(1000, "cash")]);
    expect(t.receivedCount).toBe(1);
  });

  it("counts a downward hand correction as money out", () => {
    const t = receivedDepositTotals([row(1000, "manual"), row(-500, "manual")]);
    expect(t.receivedMinor).toBe(1000);
    expect(t.returnedMinor).toBe(500);
    expect(t.netMinor).toBe(500);
  });
});
