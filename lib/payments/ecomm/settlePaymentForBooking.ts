import { prisma } from "@/lib/db";
import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { sendBookingConfirmationEmail } from "@/lib/email/sendBookingConfirmationEmail";
import { notifyTrainersNewBooking } from "@/lib/notifications/notifyTrainersNewBooking";
import { getTransactionResult } from "./client";
import { formatResultCode } from "./responseCodes";

/**
 * Settle a card booking against what the **bank** says happened.
 *
 * The client's browser coming back to our return URL is only a hint: ECOMM sends
 * no signed payload, so the return handler must ask MerchantHandler for the
 * result (`command=c`) and act on that alone. Per the integration manual §4.2
 * the decision rests on `RESULT` — `RESULT_CODE` and `3DSECURE` are
 * informational — and every returned field must be preserved, which is why they
 * all land on the Payment row.
 *
 * Idempotent: replaying the return POST on an already-settled booking re-reads
 * the result and writes the same state.
 */

export type SettleOutcome =
  | { ok: true; status: "paid"; bookingId: string }
  | { ok: true; status: "failed"; bookingId: string; result: string }
  | { ok: true; status: "pending"; bookingId: string; result: string }
  | { ok: false; error: string; bookingId?: string };

export async function settleEcommPaymentForBooking(args: {
  bookingId: string;
  clientIp: string;
}): Promise<SettleOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: { payment: true },
  });
  if (!booking) return { ok: false, error: "booking not found" };
  const payment = booking.payment;
  const transId = payment?.ecommTransId;
  if (!payment || !transId) {
    return {
      ok: false,
      error: "booking has no registered card transaction",
      bookingId: booking.id,
    };
  }

  const bankResult = await getTransactionResult({
    transId,
    clientIp: args.clientIp,
  });

  if (!bankResult.ok) {
    console.error("[ecomm] result lookup failed for booking", booking.id, bankResult.error);
    return { ok: false, error: bankResult.error, bookingId: booking.id };
  }

  // Preserve every field the bank sent, whatever the outcome.
  const bankFields = {
    ecommResult: bankResult.result,
    ecommResultCode: bankResult.resultCode ?? null,
    ecomm3dSecure: bankResult.threeDSecure ?? null,
    ecommRrn: bankResult.rrn ?? null,
    ecommApprovalCode: bankResult.approvalCode ?? null,
    ecommCardMask: bankResult.cardMask ?? null,
  };

  if (bankResult.result === "OK") {
    const alreadyPaid =
      payment.status === PaymentStatus.paid && booking.status === BookingStatus.paid;

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { ...bankFields, status: PaymentStatus.paid },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.paid },
      }),
      // The card charge IS the one-off standing deposit (see lib/deposit.ts):
      // `source=card` is offered precisely to the client who doesn't have one
      // yet. The bank confirmed the money moved, so record it on the profile —
      // otherwise it stays invisible, the client can never book with `balance`,
      // and an admin can't even refund it.
      //
      // The amount recorded is what the bank actually took (`payment.amount`),
      // not what the setting says now: the studio may raise the deposit between
      // this payment and the next screen that reads the balance.
      //
      // Conditional on `lt`, so this is idempotent: a replayed return POST or a
      // second card booking can never stack two deposits, and it never lowers a
      // balance the client already holds from a bigger deposit.
      prisma.user.updateMany({
        where: { id: booking.userId, depositBalance: { lt: payment.amount } },
        data: { depositBalance: payment.amount },
      }),
    ]);

    if (!alreadyPaid) {
      // Receipt + trainer ping happen once, on the transition only.
      await sendBookingConfirmationEmail(booking.id);
      await notifyTrainersNewBooking(booking.id);
    }
    return { ok: true, status: "paid", bookingId: booking.id };
  }

  // CREATED / PENDING mean the bank hasn't finished — leave the hold in place
  // and let the client retry; the JIT sweep (SPEC §5.4) releases the spot if
  // they never come back.
  if (bankResult.result === "CREATED" || bankResult.result === "PENDING") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: bankFields,
    });
    return { ok: true, status: "pending", bookingId: booking.id, result: bankResult.result };
  }

  // FAILED / DECLINED / REVERSED / AUTOREVERSED / TIMEOUT — no money moved.
  // Log the reason in words: a bare "116" in the journal tells staff nothing.
  console.warn(
    "[ecomm] payment not completed for booking",
    booking.id,
    `RESULT=${bankResult.result}`,
    formatResultCode(bankResult.resultCode) ?? "",
  );
  // The booking stays `booked` (the spot is still held per SPEC §5.3) so the
  // client can retry; the abandoned-checkout sweep frees it after 15 minutes.
  await prisma.payment.update({
    where: { id: payment.id },
    data: { ...bankFields, status: PaymentStatus.failed },
  });
  return { ok: true, status: "failed", bookingId: booking.id, result: bankResult.result };
}
