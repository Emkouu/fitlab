import { describe, expect, it } from "vitest";
import {
  cardTransactionAttempts,
  isRecheckable,
  isRefundable,
  type PaymentAttemptSource,
} from "./transactionHistory";

/**
 * The real shape of the row the bank asked us about on 11.08.2026: a successful
 * transaction preceded by two declined attempts on the same card, all three of
 * which we must be able to show.
 */
const PAID: PaymentAttemptSource = {
  amount: 100,
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

describe("isRefundable", () => {
  const [current, archived] = cardTransactionAttempts(PAID);

  it("offers the refund on a charged, not-yet-refunded transaction", () => {
    // Note what it does NOT consult: the client's deposit balance. The acquirer
    // asks us to reverse a transaction, so a burned or already-cleared deposit
    // is bookkeeping, not a blocker.
    expect(isRefundable(current, "paid")).toBe(true);
  });

  it("stays off until the bank has actually taken the money", () => {
    expect(isRefundable(current, "pending")).toBe(false);
    expect(isRefundable(current, "failed")).toBe(false);
  });

  it("stays off once the money has gone back", () => {
    expect(isRefundable(current, "refunded")).toBe(false);
    // Even mislabelled as paid, a recorded refund closes the door.
    expect(
      isRefundable(
        {
          ...current,
          refund: { transId: "rf-1", amountMinor: 100, atISO: null },
        },
        "paid",
      ),
    ).toBe(false);
  });

  it("never offers it for a superseded attempt", () => {
    // command=k reverses the transaction the row currently describes; the
    // archived ones were declined and never took anything.
    expect(isRefundable(archived, "paid")).toBe(false);
  });
});
