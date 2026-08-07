"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { normalizeClientIp } from "@/lib/payments/ecomm/protocol";
import {
  ECOMM_BOOKING_COOKIE,
  ECOMM_BOOKING_COOKIE_OPTIONS,
} from "@/lib/payments/ecomm/returnLeg";
import {
  payPathForBooking,
  startEcommPaymentForBooking,
} from "@/lib/payments/ecomm/startPaymentForBooking";

/**
 * „Продължи плащането" for a card booking whose deposit never went through —
 * the client abandoned the bank's page, or the transaction failed.
 *
 * Returns an in-app path (`/pay/<id>`), not a bank URL: the hop to Fibank has to
 * be a POST carrying `trans_id`, which is what that page does.
 *
 * A pending transaction is reused; a failed one is re-registered, because ECOMM
 * will not accept a second attempt on a spent identifier.
 */
export async function getCheckoutUrl(bookingId: string): Promise<{
  ok: boolean;
  url?: string;
  reason?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, reason: "unauthenticated" };
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: { select: { id: true, status: true, ecommTransId: true } },
        user: { select: { id: true, supabaseUserId: true } },
      },
    });

    if (!booking) {
      console.error("[getCheckoutUrl] booking not found:", bookingId);
      return { ok: false, reason: "not_found" };
    }

    // Ownership: a booking is only ever payable by the person who made it.
    if (booking.user.supabaseUserId !== user.id) {
      console.error("[getCheckoutUrl] user mismatch for booking", bookingId);
      return { ok: false, reason: "forbidden" };
    }

    if (booking.payment?.status === PaymentStatus.paid) {
      return { ok: false, reason: "already_paid" };
    }

    // A live registration can be resumed as-is; anything else gets a fresh one.
    if (
      booking.payment?.ecommTransId &&
      booking.payment.status === PaymentStatus.pending
    ) {
      await rememberPendingBooking(booking.id);
      return { ok: true, url: payPathForBooking(booking.id) };
    }

    const hdrs = await headers();
    const clientIp = normalizeClientIp(
      hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip"),
    );

    const started = await startEcommPaymentForBooking({
      bookingId: booking.id,
      clientIp,
    });
    if (!started.ok) {
      console.error("[getCheckoutUrl] ECOMM registration failed:", started.error);
      return { ok: false, reason: "payment_error" };
    }

    await rememberPendingBooking(booking.id);
    return { ok: true, url: started.payPath };
  } catch (e) {
    console.error("[getCheckoutUrl] unexpected error:", e);
    return { ok: false, reason: "payment_error" };
  }
}

/** Ties the bank's cross-site POST back to this booking (see returnLeg.ts). */
async function rememberPendingBooking(bookingId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ECOMM_BOOKING_COOKIE, bookingId, ECOMM_BOOKING_COOKIE_OPTIONS);
}
