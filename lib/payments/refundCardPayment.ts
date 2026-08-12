import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { refundTransaction } from "@/lib/payments/ecomm/client";
import type { ArchivedRefund } from "@/lib/payments/ecomm/transactionHistory";

/**
 * Send money back to the card it came from — the one refund mechanism the site
 * is required to have (Fibank instruction §I.16: "при необходимост от връщане на
 * суми, платени с карта … този процес трябва да се реализира чрез картова
 * операция за връщане на сумата към същата картова сметка").
 *
 * There is deliberately no "refund to balance" or "refund by transfer" branch
 * for card payments: the card operation is the only permitted route, and the
 * Общи условия promise exactly that.
 *
 * Two modes, and the difference matters:
 *
 * - **Default (guarded).** Refuses anything our own record says was never
 *   charged. Used by the automatic paths — a cancelled class, a deposit
 *   returned on request — where nobody is looking at the bank's answer.
 * - **`force: true`.** Skips our record entirely and asks the bank. This exists
 *   because our record is exactly what's unreliable: a client who closes the tab
 *   on the card page leaves the row `pending` with no `RESULT` even though the
 *   money moved, and that is precisely the case the acquirer writes to us about
 *   („моля да направите пълно възстановяване на сумата на двете транзакции").
 *   The bank is the authority on whether there is anything to give back, so a
 *   forced refund lets it answer instead of guessing locally. Reserved for the
 *   admin panel's own button, behind super_admin and a two-step confirm.
 *
 * `transId` picks *which* transaction to reverse. A retried card leaves several
 * behind one `Payment` row (see `appendSupersededAttempt`), and the one the bank
 * names is often a superseded one; passing its id reverses that transaction and
 * records the refund inside its history entry, leaving the row's own refund
 * columns — which describe the current attempt — untouched.
 *
 * Legacy note: bookings paid through the old Stripe test integration have no
 * `ecommTransId`. They cannot be refunded from here — the ECOMM API only knows
 * its own transactions — so they are reported as `unsupported` for manual
 * handling rather than silently marked refunded.
 */

export type RefundCardPaymentResult =
  | {
      ok: true;
      alreadyRefunded: boolean;
      refundedAmount: number;
      /** The transaction that was actually reversed. */
      transId: string;
      /** False when a superseded attempt was reversed. */
      wasCurrentAttempt: boolean;
    }
  | {
      ok: false;
      reason: "not_found" | "not_paid" | "unsupported" | "bank_declined";
      error: string;
      /** The bank's RESULT_CODE, when it answered — worth showing to staff. */
      resultCode?: string;
    };

/**
 * A history entry, as `appendSupersededAttempt` writes it, plus the `refund` a
 * forced refund adds. Concrete field types (rather than `unknown`) so the array
 * can go straight back into the JSON column.
 */
type StoredAttempt = {
  transId?: string | null;
  result?: string | null;
  resultCode?: string | null;
  threeDSecure?: string | null;
  rrn?: string | null;
  approvalCode?: string | null;
  cardMask?: string | null;
  amount?: number;
  supersededAt?: string;
  refund?: ArchivedRefund;
};

export async function refundCardPayment(args: {
  paymentId: string;
  /** Minor units; omit for a full refund of the original amount. */
  amountMinor?: number;
  /** Which transaction to reverse. Defaults to the row's current attempt. */
  transId?: string;
  /** Ask the bank even when our own record says nothing was charged. */
  force?: boolean;
}): Promise<RefundCardPaymentResult> {
  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment) {
    return { ok: false, reason: "not_found", error: "payment not found" };
  }

  const history: StoredAttempt[] = Array.isArray(payment.ecommHistory)
    ? (payment.ecommHistory as StoredAttempt[])
    : [];

  const transId = args.transId ?? payment.ecommTransId;
  if (!transId) {
    return {
      ok: false,
      reason: "unsupported",
      error: "payment has no ECOMM transaction (legacy Stripe payment) — refund manually",
    };
  }

  // A transaction is only refundable through the row that owns it — this is what
  // stops a crafted id from reversing some other client's payment.
  const isCurrent = transId === payment.ecommTransId;
  const archivedIndex = isCurrent
    ? -1
    : history.findIndex(
        (e) => e && typeof e === "object" && e.transId === transId,
      );
  if (!isCurrent && archivedIndex === -1) {
    return {
      ok: false,
      reason: "not_found",
      error: `transaction ${transId} does not belong to payment ${payment.id}`,
    };
  }
  const archived = archivedIndex === -1 ? null : history[archivedIndex];

  // ─── Already given back? Say so instead of asking the bank twice ─────────
  if (isCurrent) {
    if (payment.status === PaymentStatus.refunded || payment.ecommRefundTransId) {
      return {
        ok: true,
        alreadyRefunded: true,
        refundedAmount: payment.refundedAmount ?? payment.amount,
        transId,
        wasCurrentAttempt: true,
      };
    }
  } else {
    const previous = archived?.refund;
    if (previous?.transId) {
      return {
        ok: true,
        alreadyRefunded: true,
        refundedAmount: previous.amountMinor ?? 0,
        transId,
        wasCurrentAttempt: false,
      };
    }
  }

  // What the bank took for this particular transaction. The row's `amount` is
  // the current attempt's; an archived entry carries its own.
  const chargedMinor =
    isCurrent || typeof archived?.amount !== "number"
      ? payment.amount
      : archived.amount;

  if (!args.force) {
    if (!isCurrent) {
      return {
        ok: false,
        reason: "unsupported",
        error: `transaction ${transId} is a superseded attempt; only a forced refund may target it`,
      };
    }
    if (payment.status !== PaymentStatus.paid) {
      return {
        ok: false,
        reason: "not_paid",
        error: `payment is ${payment.status}; only a paid transaction can be refunded`,
      };
    }
  }

  const amountMinor = args.amountMinor ?? chargedMinor;
  if (amountMinor <= 0 || amountMinor > chargedMinor) {
    return {
      ok: false,
      reason: "not_paid",
      error: `refund amount ${amountMinor} is outside the charged amount ${chargedMinor}`,
    };
  }

  // Network I/O stays outside any Prisma transaction (CLAUDE.md admin rules).
  const bank = await refundTransaction({
    transId,
    // Send the amount explicitly only for a partial refund, so a full refund
    // uses the bank's own record of the original sum.
    amountMinor: amountMinor === chargedMinor ? undefined : amountMinor,
  });

  if (!bank.ok) {
    console.error("[refund] bank declined", payment.id, transId, bank.error, bank.resultCode);
    return {
      ok: false,
      reason: "bank_declined",
      error: bank.error,
      resultCode: bank.resultCode,
    };
  }

  const refundedAt = new Date();

  if (isCurrent) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.refunded,
        ecommRefundTransId: bank.refundTransId ?? null,
        refundedAmount: amountMinor,
        refundedAt,
      },
    });
  } else {
    // The row still describes the current attempt, so its status and refund
    // columns stay as they are; the refund is recorded on the entry it belongs
    // to. `ecommHistory` is append-only in spirit — this adds a field to one
    // entry and rewrites nothing else.
    const refund: ArchivedRefund = {
      transId: bank.refundTransId ?? transId,
      amountMinor,
      atISO: refundedAt.toISOString(),
    };
    const updated = history.map((entry, i) =>
      i === archivedIndex ? { ...entry, refund } : entry,
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: { ecommHistory: updated },
    });
  }

  return {
    ok: true,
    alreadyRefunded: false,
    refundedAmount: amountMinor,
    transId,
    wasCurrentAttempt: isCurrent,
  };
}
