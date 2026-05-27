"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking";
import { BookingSource } from "@/lib/generated/prisma/enums";

/**
 * Result shape for the booking server action. Mirrors the engine's outcome
 * set but adds the auth-related failure modes the engine doesn't know about
 * (the engine takes a userId; auth lives one layer up).
 */
export type BookClassActionResult =
  | { ok: true; bookingId: string }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "no_profile"
        | "class_not_found"
        | "class_in_past"
        | "full"
        | "duplicate";
      message: string;
    };

/**
 * Server action invoked by the BookingModal when the user taps „Потвърди".
 * Stripe Checkout is step 7; for now `card` source just lands a booking
 * with status `booked` (the engine handles that). `onsite_deposit` lands
 * directly as `pending_deposit`. Both reserve the spot atomically.
 */
export async function bookClassAction(input: {
  scheduledClassId: string;
  source: "card" | "onsite_deposit";
}): Promise<BookClassActionResult> {
  // 1. Auth gate — required to book.
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

  // 2. Resolve the Supabase auth user → FitLab User row.
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) {
    return {
      ok: false,
      reason: "no_profile",
      message: "Профилът ти все още се настройва. Опитай отново след секунда.",
    };
  }

  // 3. Validate the source string and hand off to the engine.
  const source =
    input.source === "card" ? BookingSource.card : BookingSource.onsite_deposit;

  const r = await createBooking(prisma, {
    userId: profile.id,
    scheduledClassId: input.scheduledClassId,
    source,
  });

  if (!r.ok) {
    return r; // engine returns the same shape we surface
  }

  // 4. Bust the schedule cache so the capacity pill ticks down on next render.
  revalidatePath("/schedule");

  return { ok: true, bookingId: r.booking.id };
}
