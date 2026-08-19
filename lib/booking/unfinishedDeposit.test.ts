import { describe, expect, it } from "vitest";
import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { isUnfinishedCardDeposit } from "./unfinishedDeposit";

const row = (over: Partial<Parameters<typeof isUnfinishedCardDeposit>[0]> = {}) => ({
  source: "card",
  status: BookingStatus.booked,
  paymentStatus: PaymentStatus.pending,
  ...over,
});

describe("isUnfinishedCardDeposit", () => {
  it("catches the abandoned bank page: card hold, payment still pending", () => {
    expect(isUnfinishedCardDeposit(row())).toBe(true);
  });

  it("catches a hold where no payment row was ever created", () => {
    expect(isUnfinishedCardDeposit(row({ paymentStatus: null }))).toBe(true);
  });

  it("counts a failed attempt as unfinished — no money arrived", () => {
    expect(isUnfinishedCardDeposit(row({ paymentStatus: PaymentStatus.failed }))).toBe(true);
  });

  it("trusts a paid Payment even if the booking status lags behind", () => {
    expect(isUnfinishedCardDeposit(row({ paymentStatus: PaymentStatus.paid }))).toBe(false);
  });

  it("leaves a settled card booking alone", () => {
    expect(
      isUnfinishedCardDeposit(row({ status: BookingStatus.paid, paymentStatus: PaymentStatus.paid })),
    ).toBe(false);
  });

  it("never touches an on-site deposit — that client is expected to walk in", () => {
    expect(
      isUnfinishedCardDeposit({
        source: "onsite_deposit",
        status: BookingStatus.pending_deposit,
        paymentStatus: null,
      }),
    ).toBe(false);
  });

  it("never touches a booking backed by the standing deposit", () => {
    expect(
      isUnfinishedCardDeposit({
        source: "balance",
        status: BookingStatus.booked,
        paymentStatus: null,
      }),
    ).toBe(false);
  });

  it("leaves a resolved booking out, whatever the payment says", () => {
    for (const status of [BookingStatus.attended, BookingStatus.no_show, BookingStatus.cancelled]) {
      expect(isUnfinishedCardDeposit(row({ status }))).toBe(false);
    }
  });
});
