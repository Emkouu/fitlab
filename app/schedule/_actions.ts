"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking";
import { startEcommPaymentForBooking } from "@/lib/payments/ecomm/startPaymentForBooking";
import { normalizeClientIp } from "@/lib/payments/ecomm/protocol";
import {
  ECOMM_BOOKING_COOKIE,
  ECOMM_BOOKING_COOKIE_OPTIONS,
} from "@/lib/payments/ecomm/returnLeg";
import { POLICIES_LAST_UPDATED } from "@/lib/legal/company";
import { DEPOSIT_UNIT_MINOR } from "@/lib/deposit";
import {
  isClassFeeMethod,
  type ClassFeeMethod,
} from "@/lib/payments/classFeeMethods";
import { sendBookingConfirmationEmail } from "@/lib/email/sendBookingConfirmationEmail";
import { notifyAdminsNewBooking } from "@/lib/notifications/notifyAdminsNewBooking";
import { notifyTrainersNewBooking } from "@/lib/notifications/notifyTrainersNewBooking";
import { BookingSource, BookingStatus } from "@/lib/generated/prisma/enums";
import { sofiaDateKey } from "@/lib/format";
import { isWithinPublicWindow } from "@/lib/schedule/publicWindow";
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
 *
 * Clamped to the public 7-day window: days outside it come back empty, so the
 * calendar can't leak (or book) a class further out than clients should see.
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
      practice: { select: { name: true, description: true, priceMinor: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      studio: {
        select: {
          name: true,
          cancelWindowHours: true,
          cardPaymentsEnabled: true,
          defaultClassPrice: true,
        },
      },
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
    if (!isWithinPublicWindow(key)) continue;
    (byKey[key] ??= []).push(r);
  }
  return byKey;
}

/**
 * Result shape for the booking server action. Mirrors the engine's outcome
 * set + the auth-related failure modes the engine doesn't know about. On
 * card success it carries a `redirectTo` path pointing at our own /pay page,
 * which POSTs the client onward to Fibank's card-entry page; the client must
 * navigate the browser there.
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
        | "insufficient_balance"
        | "card_disabled"
        | "terms_not_accepted";
      message: string;
    };

/**
 * Server action invoked by the BookingModal when the user taps „Потвърди".
 *  - source = "card"          → booking reserved (status `booked`), an ECOMM
 *                               transaction is registered with Fibank and
 *                               redirectTo points at /pay/<id>, which POSTs the
 *                               client to the bank's card page. The return leg
 *                               (`/api/payments/ecomm/return`) flips to `paid`.
 *  - source = "onsite_deposit" → booking reserved as `pending_deposit`,
 *                               no bank call.
 *  - source = "balance"       → booking reserved as `booked`, backed by the
 *                               standing deposit; nothing is charged.
 */
export async function bookClassAction(input: {
  scheduledClassId: string;
  source: "card" | "onsite_deposit" | "balance";
  /** How the client intends to pay the CLASS FEE on site. Persisted on the
   *  booking (staff confirm/correct it in Attendance) and mentioned in the
   *  admin new-booking notification. */
  method?: ClassFeeMethod;
  /** The client ticked „Приемам Общите условия". Required by the acquirer
   *  before a client may be redirected to the card-data page, so it gates
   *  every source — not just `card` — and is recorded on the booking. */
  acceptTerms?: boolean;
}): Promise<BookClassActionResult> {
  // 0. Terms consent. Checked before anything is written: the acquirer requires
  //    explicit agreement with the Общи условия prior to the card-data page,
  //    and we keep the proof on the Booking row.
  if (input.acceptTerms !== true) {
    return {
      ok: false,
      reason: "terms_not_accepted",
      message: "Приеми Общите условия, за да продължиш.",
    };
  }

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

  // Server-side card kill-switch guard. UI hides the card option when the
  // studio has card payments off, but never trust the client.
  if (source === BookingSource.card) {
    const cls = await prisma.scheduledClass.findUnique({
      where: { id: input.scheduledClassId },
      select: { studio: { select: { cardPaymentsEnabled: true } } },
    });
    if (cls && !cls.studio.cardPaymentsEnabled) {
      return {
        ok: false,
        reason: "card_disabled",
        message: "Плащането с карта е временно недостъпно. Избери друг начин.",
      };
    }
  }

  // Server-side deposit guard. The deposit is a standing guarantee (paid once
  // at the studio, see lib/deposit.ts): a client needs one on the profile to
  // reserve, but booking does NOT spend it. Never trust the client, re-check.
  if (source === BookingSource.balance) {
    if (profile.depositBalance < DEPOSIT_UNIT_MINOR) {
      return {
        ok: false,
        reason: "insufficient_balance",
        message: "Нямаш платен депозит. Плати депозит в студиото, за да запазиш място.",
      };
    }
  }

  const r = await createBooking(prisma, {
    userId: profile.id,
    scheduledClassId: input.scheduledClassId,
    source,
    // The class fee is paid on site whatever the source — keep the client's
    // intended method so staff see it in Attendance. Validated, never trusted.
    onsiteMethod: isClassFeeMethod(input.method) ? input.method : null,
    // Which revision of the Общи условия was on screen when they ticked.
    termsVersion: POLICIES_LAST_UPDATED,
  });

  if (!r.ok) {
    return r;
  }

  // NOTE: no deposit debit here. The deposit is paid once and stays on the
  // profile; it is only burned on a no-show or a late cancel (lib/deposit.ts).

  // 4. Card path → register the transaction with Fibank ECOMM. The client is
  //    then sent to our own /pay page, which POSTs them to the bank's
  //    card-entry page (the bank requires a POST carrying `trans_id`).
  if (source === BookingSource.card) {
    const hdrs = await headers();
    const clientIp = normalizeClientIp(
      hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip"),
    );

    const started = await startEcommPaymentForBooking({
      bookingId: r.booking.id,
      clientIp,
    });

    if (!started.ok) {
      // Booking is already in `booked`; surface the error so the user can
      // retry. A retry re-registers a fresh transaction — ECOMM will not
      // accept a second attempt on a spent identifier.
      console.error("[bookClassAction] ECOMM registration failed", started.error);
      return {
        ok: false,
        reason: "checkout_failed",
        message: "Неуспешно стартиране на плащането. Опитай отново.",
      };
    }

    // Remember which booking is mid-payment so the bank's cross-site POST back
    // to returnOkUrl can be tied to it without trusting the request body.
    const jar = await cookies();
    jar.set(ECOMM_BOOKING_COOKIE, r.booking.id, ECOMM_BOOKING_COOKIE_OPTIONS);

    // Bust the schedule cache so the capacity pill ticks down even if the
    // user abandons payment (spot is still held per SPEC §5.3).
    revalidatePath("/schedule");
    return { ok: true, bookingId: r.booking.id, redirectTo: started.payPath };
  }

  // 5. Balance / on-site path — send confirmation email now (the card path
  //    waits for the bank's result to flip to `paid` before notifying).
  await sendBookingConfirmationEmail(r.booking.id);
  // Ping the admins about the new booking (in-app bell + email). Fires for
  // both deposit (balance) and on-site bookings — the two client paths that
  // confirm immediately. Best-effort; never blocks or fails the booking.
  if (
    source === BookingSource.onsite_deposit ||
    source === BookingSource.balance
  ) {
    await notifyAdminsNewBooking(r.booking.id, input.method);
  }
  // Email the trainer(s) of THIS class (only those with a linked account).
  await notifyTrainersNewBooking(r.booking.id);
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

/**
 * Clear (delete) a single notification for the current user. Scoped to the
 * authenticated user via `userId` in the WHERE so nobody can delete another
 * user's notifications — `deleteMany` no-ops if the id isn't theirs.
 */
export async function clearNotificationAction(
  notificationId: string,
): Promise<{ ok: boolean }> {
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

  await prisma.notification.deleteMany({
    where: { id: notificationId, userId: profile.id },
  });
  revalidatePath("/schedule");
  return { ok: true };
}
