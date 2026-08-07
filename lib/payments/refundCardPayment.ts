import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { refundTransaction } from "@/lib/payments/ecomm/client";

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
 * Legacy note: bookings paid through the old Stripe test integration have no
 * `ecommTransId`. They cannot be refunded from here — the ECOMM API only knows
 * its own transactions — so they are reported as `unsupported` for manual
 * handling rather than silently marked refunded.
 */

export type RefundCardPaymentResult =
  | { ok: true; alreadyRefunded: boolean; refundedAmount: number }
  | { ok: false; reason: "not_found" | "not_paid" | "unsupported" | "bank_declined"; error: string };

export async function refundCardPayment(args: {
  paymentId: string;
  /** Minor units; omit for a full refund of the original amount. */
  amountMinor?: number;
}): Promise<RefundCardPaymentResult> {
  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment) {
    return { ok: false, reason: "not_found", error: "payment not found" };
  }

  if (payment.status === PaymentStatus.refunded) {
    return {
      ok: true,
      alreadyRefunded: true,
      refundedAmount: payment.refundedAmount ?? payment.amount,
    };
  }
  if (payment.status !== PaymentStatus.paid) {
    return {
      ok: false,
      reason: "not_paid",
      error: `payment is ${payment.status}; only a paid transaction can be refunded`,
    };
  }
  if (!payment.ecommTransId) {
    return {
      ok: false,
      reason: "unsupported",
      error: "payment has no ECOMM transaction (legacy Stripe payment) — refund manually",
    };
  }

  const amountMinor = args.amountMinor ?? payment.amount;
  if (amountMinor <= 0 || amountMinor > payment.amount) {
    return {
      ok: false,
      reason: "not_paid",
      error: `refund amount ${amountMinor} is outside the paid amount ${payment.amount}`,
    };
  }

  // Network I/O stays outside any Prisma transaction (CLAUDE.md admin rules).
  const bank = await refundTransaction({
    transId: payment.ecommTransId,
    // Send the amount explicitly only for a partial refund, so a full refund
    // uses the bank's own record of the original sum.
    amountMinor: amountMinor === payment.amount ? undefined : amountMinor,
  });

  if (!bank.ok) {
    console.error("[refund] bank declined", payment.id, bank.error, bank.resultCode);
    return { ok: false, reason: "bank_declined", error: bank.error };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.refunded,
      ecommRefundTransId: bank.refundTransId ?? null,
      refundedAmount: amountMinor,
      refundedAt: new Date(),
    },
  });

  return { ok: true, alreadyRefunded: false, refundedAmount: amountMinor };
}
