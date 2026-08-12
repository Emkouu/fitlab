import { formatResultCode } from "./responseCodes";

/**
 * A Payment row into the list of card transactions it has actually described.
 *
 * One booking has one `Payment` row, but a declined card can be retried, and
 * ECOMM refuses a second attempt on a spent `trans_id` — so a retry registers a
 * fresh transaction and the row's `ecomm*` fields start over, with the previous
 * response archived into `ecommHistory` (see `appendSupersededAttempt`). The
 * acquirer requires every response to be preserved for every card payment
 * (integration manual §4.2), and when the bank asks us what we recorded for a
 * given `TrnID` the answer has to include the superseded attempts too.
 *
 * Pure and tested, so the admin screens and any future export read the same
 * shape rather than each re-deriving it from raw JSON.
 */

/**
 * A refund recorded against an archived attempt.
 *
 * The row's own `ecommRefundTransId` / `refundedAmount` / `refundedAt` columns
 * describe the attempt the row currently is; a superseded attempt has nowhere
 * else to keep its refund, so it keeps it inside its own history entry.
 */
export type ArchivedRefund = {
  transId: string;
  amountMinor: number | null;
  atISO: string | null;
};

/** One archived attempt, exactly as `appendSupersededAttempt` writes it. */
type StoredAttempt = {
  transId?: unknown;
  result?: unknown;
  resultCode?: unknown;
  threeDSecure?: unknown;
  rrn?: unknown;
  approvalCode?: unknown;
  cardMask?: unknown;
  amount?: unknown;
  supersededAt?: unknown;
  /** Written by `refundCardPayment` when a superseded attempt is reversed. */
  refund?: unknown;
};

export type CardTransactionAttempt = {
  transId: string | null;
  /** RESULT — the only field that decides success. null = never answered. */
  result: string | null;
  resultCode: string | null;
  /** `"116 — Decline, not sufficient funds"`, for the screen. */
  resultCodeText: string | null;
  threeDSecure: string | null;
  rrn: string | null;
  approvalCode: string | null;
  cardMask: string | null;
  amountMinor: number;
  /**
   * The attempt the row currently describes — the one a refund would go
   * against, and the only one worth re-asking the bank about.
   */
  isCurrent: boolean;
  /**
   * When this attempt stopped changing: the row's `updatedAt` for the current
   * attempt, `supersededAt` for an archived one. ISO, for the client component.
   */
  atISO: string | null;
  /** Set only on the current attempt, and only once money went back. */
  refund: {
    transId: string;
    amountMinor: number | null;
    atISO: string | null;
  } | null;
};

export type PaymentAttemptSource = {
  amount: number;
  ecommTransId: string | null;
  ecommResult: string | null;
  ecommResultCode: string | null;
  ecomm3dSecure: string | null;
  ecommRrn: string | null;
  ecommApprovalCode: string | null;
  ecommCardMask: string | null;
  ecommRefundTransId: string | null;
  refundedAmount: number | null;
  refundedAt: Date | null;
  ecommHistory: unknown;
  updatedAt: Date;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * Newest first: the current attempt, then the archived ones in reverse order of
 * archiving. A row with no `ecommTransId` at all (a leftover from the removed
 * Stripe integration) yields nothing — there is no card transaction to show.
 */
export function cardTransactionAttempts(
  payment: PaymentAttemptSource,
): CardTransactionAttempt[] {
  const attempts: CardTransactionAttempt[] = [];

  if (payment.ecommTransId) {
    attempts.push({
      transId: payment.ecommTransId,
      result: payment.ecommResult,
      resultCode: payment.ecommResultCode,
      resultCodeText: formatResultCode(payment.ecommResultCode),
      threeDSecure: payment.ecomm3dSecure,
      rrn: payment.ecommRrn,
      approvalCode: payment.ecommApprovalCode,
      cardMask: payment.ecommCardMask,
      amountMinor: payment.amount,
      isCurrent: true,
      atISO: payment.updatedAt.toISOString(),
      refund: payment.ecommRefundTransId
        ? {
            transId: payment.ecommRefundTransId,
            amountMinor: payment.refundedAmount,
            atISO: payment.refundedAt?.toISOString() ?? null,
          }
        : null,
    });
  }

  const archived = Array.isArray(payment.ecommHistory)
    ? (payment.ecommHistory as StoredAttempt[])
    : [];

  for (const entry of [...archived].reverse()) {
    if (!entry || typeof entry !== "object") continue;
    attempts.push({
      transId: str(entry.transId),
      result: str(entry.result),
      resultCode: str(entry.resultCode),
      resultCodeText: formatResultCode(str(entry.resultCode)),
      threeDSecure: str(entry.threeDSecure),
      rrn: str(entry.rrn),
      approvalCode: str(entry.approvalCode),
      cardMask: str(entry.cardMask),
      amountMinor: typeof entry.amount === "number" ? entry.amount : 0,
      isCurrent: false,
      atISO: str(entry.supersededAt),
      refund: readArchivedRefund(entry.refund),
    });
  }

  return attempts;
}

/** The `refund` object a forced refund writes back into a history entry. */
function readArchivedRefund(value: unknown): ArchivedRefund | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const transId = str(raw.transId);
  if (!transId) return null;
  return {
    transId,
    amountMinor: typeof raw.amountMinor === "number" ? raw.amountMinor : null,
    atISO: str(raw.atISO),
  };
}

/**
 * Can the bank still tell us something new about this attempt?
 *
 * A registered transaction with no `RESULT` is the gap the acquirer's questions
 * land in: the client was sent to the card page and never came back to our
 * return URL, so `command=c` was never asked. `CREATED`/`PENDING` mean the bank
 * itself hadn't finished. Anything else is final.
 */
export function isRecheckable(attempt: CardTransactionAttempt): boolean {
  if (!attempt.isCurrent || !attempt.transId) return false;
  if (attempt.result === null) return true;
  return attempt.result === "CREATED" || attempt.result === "PENDING";
}

/** Mirrors Prisma's `PaymentStatus`, kept local so this file stays pure. */
export type PaymentStatusName = "pending" | "paid" | "failed" | "refunded";

/**
 * Does OUR OWN record show money that can be given back for this attempt?
 *
 * Note what this does **not** decide: whether the screen shows a refund button.
 * That button is unconditional, because our record is the unreliable half — a
 * client who abandons the bank's card page leaves the row `pending` with no
 * `RESULT` while the money has in fact moved, and those are exactly the
 * transactions the acquirer writes to us about. Only the bank knows, so the
 * button always asks it. This function decides whether the press is *expected*
 * to succeed or is a **forced** attempt that needs a warning first.
 *
 * Deliberately nothing here about the client's profile either: the acquirer's
 * requests name a transaction („пълно възстановяване на сумата на двете
 * транзакции"), so whether the deposit is still standing on the balance, was
 * burned on a no-show or was already cleared has no bearing on it.
 *
 * - the payment is `paid` — we recorded the bank taking the money (`pending` has
 *   no result yet, `failed` was declined, `refunded` already went back);
 * - it is the row's **current** attempt — superseded ones were declined;
 * - nothing has been refunded against it yet.
 */
export function isRefundable(
  attempt: CardTransactionAttempt,
  paymentStatus: PaymentStatusName,
): boolean {
  if (!attempt.isCurrent || !attempt.transId) return false;
  if (attempt.refund !== null) return false;
  return paymentStatus === "paid";
}
