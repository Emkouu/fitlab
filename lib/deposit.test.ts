import { describe, expect, it } from "vitest";
import {
  FALLBACK_DEPOSIT_MINOR,
  depositAmountMinor,
  hasDepositFor,
} from "./deposit";

describe("depositAmountMinor", () => {
  it("prefers the per-class override", () => {
    expect(depositAmountMinor({ depositAmount: 2500 }, { defaultDeposit: 1000 })).toBe(
      2500,
    );
  });

  it("falls back to the studio setting when the class has no override", () => {
    expect(depositAmountMinor({ depositAmount: null }, { defaultDeposit: 100 })).toBe(
      100,
    );
  });

  it("treats a per-class 0 as a real amount, not as absent", () => {
    expect(depositAmountMinor({ depositAmount: 0 }, { defaultDeposit: 1000 })).toBe(0);
  });

  it("treats a studio 0 as a real amount", () => {
    expect(depositAmountMinor({ depositAmount: null }, { defaultDeposit: 0 })).toBe(0);
  });

  it("falls back to €10 when neither level has an amount", () => {
    expect(depositAmountMinor(null, null)).toBe(FALLBACK_DEPOSIT_MINOR);
    expect(depositAmountMinor(undefined, undefined)).toBe(FALLBACK_DEPOSIT_MINOR);
    expect(depositAmountMinor({}, {})).toBe(FALLBACK_DEPOSIT_MINOR);
  });

  it("skips nonsensical values rather than charging them", () => {
    expect(depositAmountMinor({ depositAmount: -5 }, { defaultDeposit: 100 })).toBe(100);
    expect(depositAmountMinor({ depositAmount: NaN }, { defaultDeposit: 100 })).toBe(100);
    expect(depositAmountMinor({ depositAmount: -5 }, { defaultDeposit: -5 })).toBe(
      FALLBACK_DEPOSIT_MINOR,
    );
  });
});

describe("hasDepositFor", () => {
  it("covers an exact match", () => {
    expect(hasDepositFor(1000, 1000)).toBe(true);
  });

  it("covers a balance left over from a higher deposit", () => {
    expect(hasDepositFor(2000, 1000)).toBe(true);
  });

  it("rejects a balance below the required amount", () => {
    // The client paid €10 before the studio raised the deposit to €20.
    expect(hasDepositFor(1000, 2000)).toBe(false);
    expect(hasDepositFor(0, 100)).toBe(false);
  });

  it("always covers a class that asks for nothing", () => {
    expect(hasDepositFor(0, 0)).toBe(true);
  });
});
