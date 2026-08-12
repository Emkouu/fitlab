import { describe, expect, it } from "vitest";
import {
  cardTransactionAttempts,
  isRecheckable,
  type PaymentAttemptSource,
} from "./transactionHistory";

/**
 * The real shape of the row the bank asked us about on 11.08.2026: a successful
 * transaction preceded by two declined attempts on the same card, all three of
 * which we must be able to show.
 */
const PAID: PaymentAttemptSource = {
  amount: 100,
  status: "paid",
  ecommTransId: "oD9Fp8MDPSxpPkkqAH5UE9iHEjE=",
  ecommResult: "OK",
  ecommResultCode: "000",
  ecomm3dSecure: "AUTHENTICATED",
  ecommRrn: "622307846708",
  ecommApprovalCode: "572934",
  ecommCardMask: "437851******8511",
  ecommRefundTransId: null,
  refundedAmount: null,
  refundedAt: null,
  ecommHistory: [
    {
      transId: "ouqekPPD2rLedSPfvyvnSLiy3rw=",
      result: "FAILED",
      resultCode: "129",
      threeDSecure: "AUTHENTICATED",
      rrn: "622307846703",
      approvalCode: "201820",
      cardMask: "437851******8511",
      amount: 100,
      supersededAt: "2026-08-11T07:41:13.819Z",
    },
    {
      transId: "H1kbgxF2Yg6SyaLgdKImilvDf84=",
      result: "FAILED",
      resultCode: "129",
      threeDSecure: "AUTHENTICATED",
      rrn: "622307846706",
      approvalCode: "201433",
      cardMask: "437851******8511",
      amount: 100,
      supersededAt: "2026-08-11T07:42:26.920Z",
    },
  ],
  updatedAt: new Date("2026-08-11T07:43:19.000Z"),
};

/** Registered, client never came back — no result was ever recorded. */
const ABANDONED: PaymentAttemptSource = {
  ...PAID,
  amount: 1000,
  status: "pending",
  ecommTransId: "R1oHMen4MXSbz80R7wsreHaiON0=",
  ecommResult: null,
  ecommResultCode: null,
  ecomm3dSecure: null,
  ecommRrn: null,
  ecommApprovalCode: null,
  ecommCardMask: null,
  ecommHistory: null,
};

describe("cardTransactionAttempts", () => {
  it("lists the current attempt first, then the archived ones newest-first", () => {
    const attempts = cardTransactionAttempts(PAID);
    expect(attempts.map((a) => a.transId)).toEqual([
      "oD9Fp8MDPSxpPkkqAH5UE9iHEjE=",
      "H1kbgxF2Yg6SyaLgdKImilvDf84=",
      "ouqekPPD2rLedSPfvyvnSLiy3rw=",
    ]);
    expect(attempts[0].isCurrent).toBe(true);
    expect(attempts.slice(1).every((a) => !a.isCurrent)).toBe(true);
  });

  it("carries every field the bank returned for the current attempt", () => {
    expect(cardTransactionAttempts(PAID)[0]).toMatchObject({
      result: "OK",
      resultCode: "000",
      threeDSecure: "AUTHENTICATED",
      rrn: "622307846708",
      approvalCode: "572934",
      cardMask: "437851******8511",
      amountMinor: 100,
      atISO: "2026-08-11T07:43:19.000Z",
    });
  });

  it("spells out the result code so staff read words, not a bare number", () => {
    const [, declined] = cardTransactionAttempts(PAID);
    expect(declined.resultCodeText).toContain("129");
    expect(declined.resultCodeText).not.toBe("129");
  });

  it("dates an archived attempt by when it was superseded", () => {
    const [, newest] = cardTransactionAttempts(PAID);
    expect(newest.atISO).toBe("2026-08-11T07:42:26.920Z");
  });

  it("reports a refund on the attempt the money went back through", () => {
    const attempts = cardTransactionAttempts({
      ...PAID,
      ecommRefundTransId: "REFUND_ID=",
      refundedAmount: 100,
      refundedAt: new Date("2026-08-12T09:00:00.000Z"),
    });
    expect(attempts[0].refund).toEqual({
      transId: "REFUND_ID=",
      amountMinor: 100,
      atISO: "2026-08-12T09:00:00.000Z",
    });
    expect(attempts[1].refund).toBeNull();
  });

  it("shows a registered transaction that never got a result", () => {
    const [attempt, ...rest] = cardTransactionAttempts(ABANDONED);
    expect(rest).toHaveLength(0);
    expect(attempt.result).toBeNull();
    expect(attempt.transId).toBe("R1oHMen4MXSbz80R7wsreHaiON0=");
  });

  it("yields nothing for a row with no ECOMM transaction at all", () => {
    // Left over from the removed Stripe integration — no card transaction to show.
    expect(
      cardTransactionAttempts({ ...ABANDONED, ecommTransId: null }),
    ).toHaveLength(0);
  });

  it("survives a malformed history column instead of throwing", () => {
    expect(cardTransactionAttempts({ ...PAID, ecommHistory: "nonsense" })).toHaveLength(1);
    expect(cardTransactionAttempts({ ...PAID, ecommHistory: [null] })).toHaveLength(1);
    const [, partial] = cardTransactionAttempts({
      ...PAID,
      ecommHistory: [{ transId: "X=", amount: "not a number" }],
    });
    expect(partial).toMatchObject({ transId: "X=", amountMinor: 0, result: null });
  });
});

describe("refundable", () => {
  it("offers a refund on a paid transaction that hasn't been returned", () => {
    const [current, archived] = cardTransactionAttempts(PAID);
    expect(current.refundable).toBe(true);
    // The declined attempt took no money and its trans_id is spent.
    expect(archived.refundable).toBe(false);
  });

  it("stops offering one after the money went back", () => {
    const [current] = cardTransactionAttempts({
      ...PAID,
      status: "refunded",
      ecommRefundTransId: "REFUND_ID=",
      refundedAmount: 100,
      refundedAt: new Date("2026-08-12T09:00:00.000Z"),
    });
    expect(current.refundable).toBe(false);
  });

  it("never offers one where no money moved", () => {
    expect(cardTransactionAttempts(ABANDONED)[0].refundable).toBe(false);
    expect(
      cardTransactionAttempts({ ...PAID, status: "failed" })[0].refundable,
    ).toBe(false);
  });

  it("guards against a paid row that already carries a refund id", () => {
    // Belt and braces: if the status write ever lags behind the bank call, the
    // refund id is still proof the money left.
    expect(
      cardTransactionAttempts({ ...PAID, ecommRefundTransId: "REFUND_ID=" })[0]
        .refundable,
    ).toBe(false);
  });
});

describe("isRecheckable", () => {
  const [current, archived] = cardTransactionAttempts(PAID);

  it("re-asks the bank only when it may still have news", () => {
    expect(isRecheckable(cardTransactionAttempts(ABANDONED)[0])).toBe(true);
    expect(isRecheckable({ ...current, result: "CREATED" })).toBe(true);
    expect(isRecheckable({ ...current, result: "PENDING" })).toBe(true);
  });

  it("leaves final outcomes alone", () => {
    expect(isRecheckable(current)).toBe(false); // OK
    expect(isRecheckable({ ...current, result: "FAILED" })).toBe(false);
    expect(isRecheckable({ ...current, result: "REVERSED" })).toBe(false);
  });

  it("never offers a recheck for an archived attempt", () => {
    // Its trans_id is spent; the bank's answer is already on record.
    expect(isRecheckable({ ...archived, result: null })).toBe(false);
  });
});
