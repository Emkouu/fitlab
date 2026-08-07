import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { DEPOSIT_UNIT_MINOR } from "@/lib/deposit";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { registerTransaction } from "./client";

/**
 * Register the deposit payment for a card-source booking with Fibank ECOMM and
 * hand back the in-app URL that POSTs the client onward to the bank's card page.
 *
 * Replaces the Stripe Checkout hop: the amount charged is one **deposit unit**
 * (`DEPOSIT_UNIT_MINOR`, €10) — the one-off standing guarantee described in
 * `lib/deposit.ts` and quoted to the client everywhere — not
 * `ScheduledClass.depositAmount`, which is a per-class admin field the client is
 * never shown.
 *
 * Idempotent at the Booking level: a booking that already has a registered
 * transaction is sent back to the same one instead of being charged twice.
 */

export type StartPaymentResult =
  | { ok: true; payPath: string; transId: string }
  | { ok: false; error: string };

/** Where the client goes to be POSTed to the bank. */
export function payPathForBooking(bookingId: string): string {
  return `/pay/${bookingId}`;
}

/** One archived attempt, as stored in `Payment.ecommHistory`. */
type SupersededAttempt = {
  transId: string | null;
  result: string | null;
  resultCode: string | null;
  threeDSecure: string | null;
  rrn: string | null;
  approvalCode: string | null;
  cardMask: string | null;
  amount: number;
  supersededAt: string;
};

/**
 * The existing `ecomm*` fields, appended to the row's history.
 *
 * Returns the previous history untouched when there is nothing to archive — a
 * row that never got a result (the client abandoned before the bank answered)
 * carries no response worth keeping, and writing empty entries would bury the
 * real ones.
 */
export function appendSupersededAttempt(payment: {
  ecommTransId: string | null;
  ecommResult: string | null;
  ecommResultCode: string | null;
  ecomm3dSecure: string | null;
  ecommRrn: string | null;
  ecommApprovalCode: string | null;
  ecommCardMask: string | null;
  amount: number;
  ecommHistory: unknown;
}): SupersededAttempt[] {
  const previous = Array.isArray(payment.ecommHistory)
    ? (payment.ecommHistory as SupersededAttempt[])
    : [];

  // No result means the bank never answered for that trans_id — nothing to keep.
  if (!payment.ecommResult) return previous;

  return [
    ...previous,
    {
      transId: payment.ecommTransId,
      result: payment.ecommResult,
      resultCode: payment.ecommResultCode,
      threeDSecure: payment.ecomm3dSecure,
      rrn: payment.ecommRrn,
      approvalCode: payment.ecommApprovalCode,
      cardMask: payment.ecommCardMask,
      amount: payment.amount,
      supersededAt: new Date().toISOString(),
    },
  ];
}

export async function startEcommPaymentForBooking(args: {
  bookingId: string;
  /** Client's IPv4, from `normalizeClientIp(headers.get("x-forwarded-for"))`. */
  clientIp: string;
}): Promise<StartPaymentResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: {
      payment: true,
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          studio: { select: { name: true } },
        },
      },
    },
  });

  if (!booking) return { ok: false, error: "booking not found" };

  // Already registered and still awaiting the client — reuse it. A `failed`
  // payment is re-registered below so the client can retry with a clean
  // transaction (ECOMM will not accept a second attempt on a failed trans_id).
  if (booking.payment?.ecommTransId && booking.payment.status === PaymentStatus.pending) {
    return {
      ok: true,
      payPath: payPathForBooking(booking.id),
      transId: booking.payment.ecommTransId,
    };
  }
  if (booking.payment?.status === PaymentStatus.paid) {
    return { ok: false, error: "booking is already paid" };
  }

  const cls = booking.scheduledClass;
  const description = `Depozit ${cls.practice.name} ${formatSofiaDay(cls.startAt)} ${formatSofiaTime(cls.startAt)}`;

  const registered = await registerTransaction({
    amountMinor: DEPOSIT_UNIT_MINOR,
    clientIp: args.clientIp,
    description,
  });
  if (!registered.ok) {
    console.error("[ecomm] registration failed for booking", booking.id, registered.error);
    return { ok: false, error: registered.error };
  }

  // One Payment row per booking (Booking.paymentId is unique). A retry after a
  // failed attempt takes over the existing row — but the superseded attempt's
  // response is archived first, because the acquirer requires every response to
  // be preserved for every card payment (manual §4.2) and this row is about to
  // start describing a different transaction.
  if (booking.payment) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: {
        amount: DEPOSIT_UNIT_MINOR,
        currency: "EUR",
        status: PaymentStatus.pending,
        ecommTransId: registered.transId,
        ecommHistory: appendSupersededAttempt(booking.payment),
        ecommResult: null,
        ecommResultCode: null,
        ecomm3dSecure: null,
        ecommRrn: null,
        ecommApprovalCode: null,
        ecommCardMask: null,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        amount: DEPOSIT_UNIT_MINOR,
        currency: "EUR",
        status: PaymentStatus.pending,
        ecommTransId: registered.transId,
        booking: { connect: { id: booking.id } },
      },
    });
  }

  return {
    ok: true,
    payPath: payPathForBooking(booking.id),
    transId: registered.transId,
  };
}
