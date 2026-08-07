import { describe, expect, it } from "vitest";
import { appendSupersededAttempt } from "./startPaymentForBooking";

/**
 * A declined card is retried by registering a fresh transaction, which resets
 * `Payment.ecomm*`. The acquirer requires every response to be preserved for
 * every card payment (manual §4.2), so the outgoing attempt is archived first —
 * these tests pin that it is never silently dropped.
 */
const DECLINED = {
  ecommTransId: "8PopyR6oXuumuh0g2FS2d1ZIPCc=",
  ecommResult: "FAILED",
  ecommResultCode: "908",
  ecomm3dSecure: "AUTHENTICATED",
  ecommRrn: "611111407831",
  ecommApprovalCode: null,
  ecommCardMask: "4***********6789",
  amount: 1000,
  ecommHistory: null,
};

describe("appendSupersededAttempt", () => {
  it("archives a declined attempt with every field the bank returned", () => {
    const [entry, ...rest] = appendSupersededAttempt(DECLINED);
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      transId: "8PopyR6oXuumuh0g2FS2d1ZIPCc=",
      result: "FAILED",
      resultCode: "908",
      threeDSecure: "AUTHENTICATED",
      rrn: "611111407831",
      approvalCode: null,
      cardMask: "4***********6789",
      amount: 1000,
    });
    expect(entry.supersededAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps earlier attempts — the log is append-only", () => {
    const existing = appendSupersededAttempt(DECLINED);
    const second = appendSupersededAttempt({
      ...DECLINED,
      ecommTransId: "SECOND_ATTEMPT_ID=",
      ecommResultCode: "116",
      ecommHistory: existing,
    });

    expect(second).toHaveLength(2);
    expect(second[0].resultCode).toBe("908");
    expect(second[1].resultCode).toBe("116");
  });

  it("archives nothing when the bank never answered", () => {
    // The client abandoned the card page: a trans_id exists but no result, so
    // there is no response to preserve and empty entries would bury real ones.
    expect(
      appendSupersededAttempt({ ...DECLINED, ecommResult: null }),
    ).toHaveLength(0);
  });

  it("preserves prior history even when the current attempt has no result", () => {
    const existing = appendSupersededAttempt(DECLINED);
    const kept = appendSupersededAttempt({
      ...DECLINED,
      ecommResult: null,
      ecommHistory: existing,
    });
    expect(kept).toEqual(existing);
  });

  it("survives a malformed history column instead of throwing", () => {
    // Hand-edited or legacy JSON must not break a payment retry.
    expect(appendSupersededAttempt({ ...DECLINED, ecommHistory: "nonsense" })).toHaveLength(1);
    expect(appendSupersededAttempt({ ...DECLINED, ecommHistory: { a: 1 } })).toHaveLength(1);
  });
});
