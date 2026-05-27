import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";

/**
 * Stripe webhook receiver. Signature is verified against
 * STRIPE_WEBHOOK_SECRET; any tampered or unsigned payload is rejected.
 * In local dev that secret comes from `stripe listen --forward-to ...`.
 *
 * The booking engine never trusts the client's success_url landing —
 * the authoritative state transition (booked → paid) only happens here,
 * after we've verified a signed event from Stripe.
 */

// Stripe needs the raw request body to verify signatures; we must NOT
// have Next route runtime body-parsing kick in. App Router route handlers
// already give us request.text() for the raw bytes, which is what we use.

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed", err);
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await handleSucceeded(event.data.object);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        await handleFailedSession(event.data.object);
        break;
      }
      case "payment_intent.payment_failed": {
        await handleFailedPaymentIntent(event.data.object);
        break;
      }
      default:
        // Stripe also fires many events we don't care about; log nothing
        // for them so the dev console stays readable.
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error for", event.type, err);
    return Response.json({ error: "handler error" }, { status: 500 });
  }

  return Response.json({ received: true });
}

/**
 * Flip the booking + payment to `paid`. Idempotent: if the booking is
 * already `paid` we no-op — Stripe will sometimes deliver the same event
 * twice.
 */
async function handleSucceeded(session: Stripe.Checkout.Session) {
  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutId: session.id },
    include: { booking: true },
  });
  if (!payment || !payment.booking) {
    console.warn("[stripe/webhook] no payment row for session", session.id);
    return;
  }

  if (
    payment.status === PaymentStatus.paid &&
    payment.booking.status === BookingStatus.paid
  ) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.paid,
        stripePaymentIntentId: paymentIntentId,
      },
    }),
    prisma.booking.update({
      where: { id: payment.booking.id },
      data: { status: BookingStatus.paid },
    }),
  ]);
}

/**
 * Session expired or async-failed: mark Payment as `failed`. The booking
 * is intentionally NOT moved to `cancelled` — SPEC §5.3 holds the spot;
 * if the user wants to release it they cancel through the normal flow,
 * or staff can release it manually. The user can retry checkout which
 * will mint a new session (the previous one is no longer `open`).
 */
async function handleFailedSession(session: Stripe.Checkout.Session) {
  await prisma.payment.updateMany({
    where: { stripeCheckoutId: session.id },
    data: { status: PaymentStatus.failed },
  });
}

async function handleFailedPaymentIntent(intent: Stripe.PaymentIntent) {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: intent.id },
    data: { status: PaymentStatus.failed },
  });
}
