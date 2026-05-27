import {
  Prisma,
  type Booking,
  type PrismaClient,
} from "@/lib/generated/prisma/client";
import {
  BookingSource,
  BookingStatus,
  PaymentStatus,
} from "@/lib/generated/prisma/enums";
import { ACTIVE_BOOKING_STATUSES } from "./statuses";

/**
 * How long a card-source booking can sit in `booked` status without a paid
 * Payment before the next createBooking on the same class will sweep it.
 * Stripe's Checkout sessions we mint expire at 1h; 15 min is a tighter
 * window so a popular class doesn't sit half-full of orphan holds.
 */
const ABANDONED_HOLD_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * FitLab booking engine — SPEC §5.
 *
 * Pure functions on top of Prisma so the booking flow can be reused by the
 * future React Native client + cron jobs. Each function opens its own
 * transaction when necessary; callers don't need to know the locking story.
 *
 * Status mapping (CLAUDE.md booking-flow reference):
 *   source = "card"   → initial status `booked`     → flips to `paid` on
 *                       successful Stripe Checkout webhook (step 7).
 *   source = "onsite_deposit" → initial status `pending_deposit`.
 * Both states are active (count against capacity).
 */

export type CreateBookingInput = {
  userId: string;
  scheduledClassId: string;
  source: BookingSource;
};

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | {
      ok: false;
      reason: "class_not_found" | "class_in_past" | "full" | "duplicate";
      /** Localized message safe to surface in UI. */
      message: string;
    };

export type CancelBookingResult =
  | { ok: true; depositForfeited: boolean }
  | { ok: false; reason: "not_found" | "already_cancelled"; message: string };

export type AttendanceOutcome = "attended" | "no_show";

export type MarkAttendanceResult =
  | { ok: true; depositBurned: boolean }
  | { ok: false; reason: "not_found"; message: string };

/* ───────────────────────────── createBooking ───────────────────────────── */

/**
 * Atomic spot reservation. Locks the ScheduledClass row inside a single
 * transaction (SELECT … FOR UPDATE), recounts active bookings against the
 * locked row, and inserts only if capacity hasn't been reached. Concurrent
 * callers on the last spot serialize on the row lock; exactly one wins.
 *
 * Duplicate prevention rides on the (userId, scheduledClassId) unique
 * index — P2002 from the insert is translated into a friendly "вече си
 * записан" message.
 */
export async function createBooking(
  prisma: PrismaClient,
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const { userId, scheduledClassId, source } = input;

  const initialStatus =
    source === BookingSource.card || source === BookingSource.balance
      ? BookingStatus.booked
      : BookingStatus.pending_deposit;

  try {
    return await prisma.$transaction(async (tx) => {
      // Row-level lock on the class for the whole transaction. Any concurrent
      // booking insert on the same class will queue behind us.
      const locked = await tx.$queryRaw<
        { id: string; capacity: number; startAt: Date }[]
      >`SELECT id, capacity, "startAt"
        FROM "ScheduledClass"
        WHERE id = ${scheduledClassId}
        FOR UPDATE`;

      if (locked.length === 0) {
        return {
          ok: false as const,
          reason: "class_not_found" as const,
          message: "Класът не е намерен.",
        };
      }

      const { capacity, startAt } = locked[0];

      if (startAt.getTime() <= Date.now()) {
        return {
          ok: false as const,
          reason: "class_in_past" as const,
          message: "Класът вече е започнал.",
        };
      }

      // Opportunistic JIT cleanup: any card-source `booked` rows on this
      // class that are older than ABANDONED_HOLD_MAX_AGE_MS and don't have
      // a paid Payment are abandoned holds — release them so the spot
      // doesn't stay frozen.
      //
      // Runs inside the row-locked transaction so concurrent bookers can't
      // both see the same stale row as "live"; whichever caller arrives
      // first sweeps and frees the spot, later callers see fresh state.
      // On-site (pending_deposit) bookings are intentionally NOT swept —
      // those are paid in cash on arrival, no timeout policy.
      const staleCutoff = new Date(Date.now() - ABANDONED_HOLD_MAX_AGE_MS);
      await tx.booking.updateMany({
        where: {
          scheduledClassId,
          status: BookingStatus.booked,
          source: BookingSource.card,
          createdAt: { lt: staleCutoff },
          OR: [
            { paymentId: null },
            { payment: { status: { not: PaymentStatus.paid } } },
          ],
        },
        data: {
          status: BookingStatus.cancelled,
          cancelledAt: new Date(),
        },
      });

      const activeCount = await tx.booking.count({
        where: {
          scheduledClassId,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
      });

      if (activeCount >= capacity) {
        return {
          ok: false as const,
          reason: "full" as const,
          message: "Класът е пълен.",
        };
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          scheduledClassId,
          source,
          status: initialStatus,
        },
      });

      return { ok: true as const, booking };
    });
  } catch (e) {
    // The unique (userId, scheduledClassId) index catches duplicates that
    // sneak past the lock (e.g. two transactions each locking different rows).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        reason: "duplicate",
        message: "Вече си записан/а за този клас.",
      };
    }
    throw e;
  }
}

/* ───────────────────────────── cancelBooking ───────────────────────────── */

/**
 * Cancellation against the studio's cancelWindowHours (SPEC §5.4):
 *   start − window  >  now  → clean: spot freed, deposit safe.
 *   start − window  ≤  now  → late: cancelled, deposit forfeited.
 *
 * Either way the booking row moves to `cancelled` and frees its spot
 * (cancelled isn't in ACTIVE_BOOKING_STATUSES). The returned flag tells
 * the caller whether the linked Payment should be refunded vs kept.
 * Payment-side refund logic is step 7-8; we only return the verdict here.
 *
 * `now` is injectable for deterministic tests.
 */
export async function cancelBooking(
  prisma: PrismaClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<CancelBookingResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the booking row so a concurrent cancel can't double-count.
    const locked = await tx.$queryRaw<
      { id: string; status: BookingStatus }[]
    >`SELECT id, status FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;

    if (locked.length === 0) {
      return {
        ok: false as const,
        reason: "not_found" as const,
        message: "Записването не е намерено.",
      };
    }

    if (locked[0].status === BookingStatus.cancelled) {
      return {
        ok: false as const,
        reason: "already_cancelled" as const,
        message: "Записването вече е отменено.",
      };
    }

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        scheduledClass: {
          include: { studio: { select: { cancelWindowHours: true } } },
        },
      },
    });

    const windowMs =
      booking.scheduledClass.studio.cancelWindowHours * 60 * 60 * 1000;
    const cutoff = booking.scheduledClass.startAt.getTime() - windowMs;
    const depositForfeited = now.getTime() > cutoff;

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.cancelled,
        cancelledAt: now,
      },
    });

    return { ok: true as const, depositForfeited };
  });
}

/* ─────────────────────────── markAttendance ─────────────────────────── */

/**
 * Staff sets a booking to attended or no_show after the class. no_show
 * burns the deposit (SPEC §5.5). We return the boolean so payment-side
 * refund / forfeit logic can act on it once it exists.
 */
export async function markAttendance(
  prisma: PrismaClient,
  bookingId: string,
  outcome: AttendanceOutcome,
): Promise<MarkAttendanceResult> {
  const status =
    outcome === "attended" ? BookingStatus.attended : BookingStatus.no_show;

  try {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return {
        ok: false,
        reason: "not_found",
        message: "Записването не е намерено.",
      };
    }
    throw e;
  }

  return { ok: true, depositBurned: outcome === "no_show" };
}
