"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking";
import { createCheckoutForBooking } from "@/lib/payments/createCheckoutForBooking";
import { sendBookingConfirmationEmail } from "@/lib/email/sendBookingConfirmationEmail";
import { BookingSource, BookingStatus } from "@/lib/generated/prisma/enums";
import { sofiaDateKey } from "@/lib/format";
import type { ClassCardRow } from "./_components/ClassCard";

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
  BookingStatus.attended,
];

/**
 * Fetches non-cancelled scheduled classes for a given Sofia calendar month,
 * grouped by Sofia date key ("YYYY-MM-DD"). Used by the Месец calendar view.
 *
 * Sofia is UTC+2/+3 — we fetch a one-day buffer on either side and filter by
 * `sofiaDateKey` so DST and TZ edges can't drop a class onto the wrong month.
 */
export async function getClassesForMonth(
  year: number,
  month: number, // 0-indexed
): Promise<Record<string, ClassCardRow[]>> {
  const start = new Date(Date.UTC(year, month, 1));
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(Date.UTC(year, month + 1, 1));
  end.setUTCDate(end.getUTCDate() + 2);

  const rows = await prisma.scheduledClass.findMany({
    where: {
      startAt: { gte: start, lt: end },
      cancelledAt: null,
    },
    orderBy: { startAt: "asc" },
    include: {
      practice: { select: { name: true, description: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      studio: { select: { name: true, cancelWindowHours: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_STATUSES } } },
        },
      },
    },
    take: 500,
  });

  const byKey: Record<string, ClassCardRow[]> = {};
  const monthStr = String(month + 1).padStart(2, "0");
  const prefix = `${year}-${monthStr}-`;
  for (const r of rows) {
    const key = sofiaDateKey(r.startAt);
    if (!key.startsWith(prefix)) continue;
    (byKey[key] ??= []).push(r);
  }
  return byKey;
}

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

  // If booking used balance source, debit atomically. The pre-check above is
  // only a fast-fail UX guard against a stale read; the authoritative guard is
  // this conditional update. `where: { depositBalance: { gte: amount } }` makes
  // the read-check-decrement a single atomic operation, so two concurrent
  // bookings for different classes can't both spend the same funds and drive
  // the balance negative (TOCTOU double-spend).
  if (source === BookingSource.balance) {
    const classData = await prisma.scheduledClass.findUnique({
      where: { id: input.scheduledClassId },
      select: { depositAmount: true },
    });
    const amount = classData?.depositAmount ?? 0;
    const debit = await prisma.user.updateMany({
      where: { id: profile.id, depositBalance: { gte: amount } },
      data: { depositBalance: { decrement: amount } },
    });
    if (debit.count === 0) {
      // Lost the race for our own funds — release the spot we just reserved
      // so it doesn't sit held by a booking that was never paid for.
      await prisma.booking.update({
        where: { id: r.booking.id },
        data: { status: BookingStatus.cancelled, cancelledAt: new Date() },
      });
      return {
        ok: false,
        reason: "insufficient_balance",
        message: "Балансът ти не е достатъчен за този клас.",
      };
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

  // 5. Balance / on-site path — send confirmation email now (card path
  //    waits for the Stripe webhook to flip to `paid` before notifying).
  await sendBookingConfirmationEmail(r.booking.id);
  revalidatePath("/schedule");
  return { ok: true, bookingId: r.booking.id };
}

/* ────────────────────── Waitlist + notifications ────────────────────── */

export type JoinWaitlistResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Add the current user to the waitlist for a class. Re-validates that the
 * class is actually full and that the user doesn't already have an active
 * booking — never trust the client.
 */
export async function joinWaitlistAction(
  scheduledClassId: string,
): Promise<JoinWaitlistResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Влез, за да се запишеш в списъка." };

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) return { ok: false, message: "Профилът ти не е готов." };

  const cls = await prisma.scheduledClass.findUnique({
    where: { id: scheduledClassId },
    select: {
      id: true,
      capacity: true,
      cancelledAt: true,
      startAt: true,
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_STATUSES } } },
        },
      },
    },
  });
  if (!cls || cls.cancelledAt) {
    return { ok: false, message: "Класът не е намерен." };
  }
  if (cls.startAt.getTime() < Date.now()) {
    return { ok: false, message: "Класът вече е започнал." };
  }
  const remaining = cls.capacity - cls._count.bookings;
  if (remaining > 0) {
    return { ok: false, message: "Класът има свободно място — запиши се директно." };
  }

  const existingBooking = await prisma.booking.findFirst({
    where: {
      userId: profile.id,
      scheduledClassId,
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
  });
  if (existingBooking) {
    return { ok: false, message: "Вече си записан/а за този клас." };
  }

  try {
    await prisma.waitlist.upsert({
      where: {
        userId_scheduledClassId: { userId: profile.id, scheduledClassId },
      },
      update: {},
      create: { userId: profile.id, scheduledClassId },
    });
  } catch (err) {
    console.error("[joinWaitlist] failed", err);
    return { ok: false, message: "Грешка. Опитай отново." };
  }

  revalidatePath("/schedule");
  return { ok: true, message: "Ще те уведомим, когато се освободи място." };
}

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  scheduledClassId: string | null;
  read: boolean;
  createdAt: string;
};

/** Returns the 20 most recent notifications for the current user. */
export async function getNotificationsAction(): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) return [];

  const rows = await prisma.notification.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    scheduledClassId: r.scheduledClassId,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Mark a set of notifications as read for the current user. */
export async function markNotificationsReadAction(
  notificationIds: string[],
): Promise<{ ok: boolean }> {
  if (notificationIds.length === 0) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) return { ok: false };

  await prisma.notification.updateMany({
    where: { id: { in: notificationIds }, userId: profile.id },
    data: { read: true },
  });
  revalidatePath("/schedule");
  return { ok: true };
}
