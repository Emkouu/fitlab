"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking";
import { createCheckoutForBooking } from "@/lib/payments/createCheckoutForBooking";
import { BookingSource } from "@/lib/generated/prisma/enums";

/**
 * Result shape for the booking server action. Mirrors the engine's outcome
 * set + the auth-related failure modes the engine doesn't know about. On
 * card success it carries a `redirectTo` URL pointing at Stripe Checkout;
 * the client must navigate the browser there.
 */
export type BookClassActionResult =
  | { ok: true; bookingId: string; redirectTo?: string }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "no_profile"
        | "class_not_found"
        | "class_in_past"
        | "full"
        | "duplicate"
        | "checkout_failed"
        | "insufficient_balance";
      message: string;
    };

/**
 * Server action invoked by the BookingModal when the user taps „Потвърди".
 *  - source = "card"          → booking reserved (status `booked`), Stripe
 *                               Checkout session minted, redirectTo set.
 *                               Webhook (step 7) flips to `paid`.
 *  - source = "onsite_deposit" → booking reserved as `pending_deposit`,
 *                               no Stripe call.
 */
export async function bookClassAction(input: {
  scheduledClassId: string;
  source: "card" | "onsite_deposit" | "balance";
}): Promise<BookClassActionResult> {
  // 1. Auth gate.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      reason: "unauthenticated",
      message: "Влез, за да запазиш място.",
    };
  }

  // 2. Resolve Supabase auth user → FitLab User row.
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, depositBalance: true },
  });
  if (!profile) {
    return {
      ok: false,
      reason: "no_profile",
      message: "Профилът ти все още се настройва. Опитай отново след секунда.",
    };
  }

  // 3. Hand off to the engine — atomic capacity check + insert.
  let source: BookingSource;
  if (input.source === "balance") {
    source = BookingSource.balance;
  } else {
    source = input.source === "card" ? BookingSource.card : BookingSource.onsite_deposit;
  }

  // Server-side balance guard. UI hides the balance option when funds are
  // short, but never trust the client — re-check here to keep depositBalance
  // from going negative.
  if (source === BookingSource.balance) {
    const cls = await prisma.scheduledClass.findUnique({
      where: { id: input.scheduledClassId },
      select: { depositAmount: true },
    });
    if (cls && profile.depositBalance < cls.depositAmount) {
      return {
        ok: false,
        reason: "insufficient_balance",
        message: "Балансът ти не е достатъчен за този клас.",
      };
    }
  }

  const r = await createBooking(prisma, {
    userId: profile.id,
    scheduledClassId: input.scheduledClassId,
    source,
  });

  if (!r.ok) {
    return r;
  }

  // If booking used balance source, deduct from user's balance
  if (input.source === "balance") {
    const classData = await prisma.scheduledClass.findUnique({
      where: { id: input.scheduledClassId },
      select: { depositAmount: true },
    });
    if (classData) {
      await prisma.user.update({
        where: { id: profile.id },
        data: {
          depositBalance: {
            decrement: classData.depositAmount,
          },
        },
      });
    }
  }

  // 4. Card path → mint a Stripe Checkout session.
  if (source === BookingSource.card) {
    try {
      const hdrs = await headers();
      const proto = hdrs.get("x-forwarded-proto") ?? "http";
      const host = hdrs.get("host") ?? "localhost:3000";
      const origin = `${proto}://${host}`;
      const checkout = await createCheckoutForBooking({
        bookingId: r.booking.id,
        origin,
      });
      // Bust the schedule cache so the capacity pill ticks down even if the
      // user abandons checkout (spot is still held per SPEC §5.3).
      revalidatePath("/schedule");
      return { ok: true, bookingId: r.booking.id, redirectTo: checkout.url };
    } catch (e) {
      console.error("[bookClassAction] checkout creation failed", e);
      // Booking is already in `booked`; surface the error so the user can
      // retry. A clean retry will hit the idempotency path in
      // createCheckoutForBooking and reuse the open session if one exists.
      return {
        ok: false,
        reason: "checkout_failed",
        message: "Неуспешно стартиране на плащането. Опитай отново.",
      };
    }
  }

  // 5. On-site path — booking is `pending_deposit`, nothing else to do.
  revalidatePath("/schedule");
  return { ok: true, bookingId: r.booking.id };
}
