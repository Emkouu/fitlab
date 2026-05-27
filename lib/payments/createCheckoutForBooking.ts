import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

export type CreateCheckoutInput = {
  bookingId: string;
  /** App origin (e.g. http://localhost:3000) for Stripe's success/cancel URLs. */
  origin: string;
};

export type CreateCheckoutResult = {
  sessionId: string;
  url: string;
};

/**
 * Mint a Stripe Checkout session for a card-source booking and persist the
 * matching Payment row. Called from the booking server action after the
 * engine has reserved the spot (status `booked`); Stripe's webhook flips
 * the booking + payment to `paid` once the customer completes checkout.
 *
 * Idempotent at the Booking level: if a Payment already exists for this
 * booking we return that session's URL instead of double-charging.
 */
export async function createCheckoutForBooking(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: input.bookingId },
    include: {
      user: { select: { id: true, email: true } },
      payment: true,
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          studio: { select: { name: true } },
        },
      },
    },
  });

  // If we already minted a session for this booking, reuse it instead of
  // creating a second charge.
  if (booking.payment?.stripeCheckoutId) {
    const existing = await stripe.checkout.sessions.retrieve(
      booking.payment.stripeCheckoutId,
    );
    if (existing.url && existing.status === "open") {
      return { sessionId: existing.id, url: existing.url };
    }
  }

  const cls = booking.scheduledClass;
  const friendlyTime = `${formatSofiaDay(cls.startAt)} · ${formatSofiaTime(cls.startAt)}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: booking.user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur", // FitLab is EUR everywhere (see CLAUDE.md).
          unit_amount: cls.depositAmount,
          product_data: {
            name: `Депозит — ${cls.practice.name}`,
            description: `${friendlyTime} · ${cls.studio.name}`,
          },
        },
      },
    ],
    // Metadata travels with every webhook event for this session and is
    // the authoritative key we use to find the booking on payment success.
    metadata: {
      bookingId: booking.id,
      userId: booking.user.id,
      scheduledClassId: booking.scheduledClassId,
    },
    success_url: `${input.origin}/schedule?paid=${booking.id}`,
    cancel_url: `${input.origin}/schedule?canceled=${booking.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
  });

  if (!session.url) {
    throw new Error("Stripe did not return a session URL");
  }

  // Persist the Payment row linked back to the booking. The unique index on
  // Booking.paymentId guarantees one Payment per booking; the unique index
  // on Payment.stripeCheckoutId guards against webhook double-handling.
  await prisma.payment.create({
    data: {
      amount: cls.depositAmount,
      currency: "EUR",
      status: PaymentStatus.pending,
      stripeCheckoutId: session.id,
      booking: { connect: { id: booking.id } },
    },
  });

  return { sessionId: session.id, url: session.url };
}
