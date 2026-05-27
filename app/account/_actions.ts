"use server";

import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { createCheckoutForBooking } from "@/lib/payments/createCheckoutForBooking";
import { headers } from "next/headers";

export async function getCheckoutUrl(bookingId: string): Promise<{
  ok: boolean;
  url?: string;
  reason?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("getCheckoutUrl: No authenticated user");
      return { ok: false, reason: "unauthenticated" };
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: { select: { stripeCheckoutId: true, id: true } },
        user: { select: { id: true, supabaseUserId: true } },
        scheduledClass: { select: { id: true } },
      },
    });

    if (!booking) {
      console.error("getCheckoutUrl: Booking not found:", bookingId);
      return { ok: false, reason: "not_found" };
    }

    // Verify ownership using supabaseUserId
    if (booking.user.supabaseUserId !== user.id) {
      console.error("getCheckoutUrl: User mismatch", {
        bookingUserSupabaseId: booking.user.supabaseUserId,
        authUserId: user.id,
      });
      return { ok: false, reason: "forbidden" };
    }

    if (!booking.payment?.stripeCheckoutId) {
      console.error("getCheckoutUrl: No payment/checkout for booking:", bookingId);
      return { ok: false, reason: "no_checkout" };
    }

    // Try to retrieve the existing Stripe session
    try {
      const session = await stripe.checkout.sessions.retrieve(booking.payment.stripeCheckoutId);
      console.log("getCheckoutUrl: Retrieved session status:", session.status);
      
      if (session.url && session.status === "open") {
        console.log("getCheckoutUrl: Reusing open session");
        return { ok: true, url: session.url };
      }
      
      console.log("getCheckoutUrl: Session not open, creating fresh checkout");
    } catch (e) {
      console.error("Failed to retrieve Stripe session:", e);
    }
    
    // Session expired, not found, or error retrieving — create a fresh one
    const hdrs = await headers();
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const host = hdrs.get("host") ?? "localhost:3000";
    const origin = `${proto}://${host}`;
    
    console.log("getCheckoutUrl: Creating fresh checkout, origin:", origin);
    
    const newCheckout = await createCheckoutForBooking({
      bookingId,
      origin,
    });
    console.log("getCheckoutUrl: Fresh checkout created successfully");
    return { ok: true, url: newCheckout.url };
  } catch (e) {
    console.error("getCheckoutUrl: Unexpected error:", e);
    return { ok: false, reason: "stripe_error" };
  }
}
