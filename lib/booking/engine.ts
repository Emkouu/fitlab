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
 * The bank's payment page has a far longer life; 15 min is a tighter
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
 *                       successful card payment (the ECOMM return leg).
 *   source = "onsite_deposit" → initial status `pending_deposit`.
 * Both states are active (count against capacity).
 */

export type CreateBookingInput = {
  userId: string;
  scheduledClassId: string;
  source: BookingSource;
  /** How the client intends to pay the CLASS FEE on site
   *  (subscription | cash | multisport). Persisted so staff see the intended
   *  method in Attendance and can confirm or correct it there. */
  onsiteMethod?: string | null;
  /** Revision of the Общи условия the client accepted (`POLICIES_LAST_UPDATED`).
   *  The caller has already refused the booking if consent was missing; passing
   *  it here just stamps the proof onto the row inside the same transaction. */
  termsVersion?: string | null;
  /** Mark this as the client's „първо посещение" — reserved without a deposit
   *  so they can see the studio first. The caller owns the eligibility check
   *  (no bookings at all); the engine only records the fact. */
  isFirstVisit?: boolean;
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
  | {
      ok: true;
      depositBurned: boolean;
      /** Status the booking had BEFORE this call — lets the caller decide
       *  whether the deposit burn still needs applying (or undoing, when a
       *  no_show is corrected to attended). */
      previousStatus: BookingStatus;
    }
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
  const { userId, scheduledClassId, source, onsiteMethod, termsVersion } = input;
  const isFirstVisit = input.isFirstVisit === true;

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
          // The class fee is settled on site for every source, so the intended
          // method is worth keeping regardless of how the spot was reserved.
          onsiteMethod: onsiteMethod ?? null,
          isFirstVisit,
          // Proof of consent, stamped in the same transaction as the row it
          // belongs to. NULL only when the caller didn't collect a version.
          ...(termsVersion != null
            ? { termsAcceptedAt: new Date(), termsVersion }
            : {}),
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
 * burns the deposit (SPEC §5.5) — we only return the verdict; the caller
 * moves the money (see app/admin/attendance/_actions.ts).
 *
 * `attended` optionally records how the CLASS FEE was paid on site
 * (subscription | cash | multisport) — the deposit is untouched either way.
 */
export async function markAttendance(
  prisma: PrismaClient,
  bookingId: string,
  outcome: AttendanceOutcome,
  opts: { method?: string | null } = {},
): Promise<MarkAttendanceResult> {
  const status =
    outcome === "attended" ? BookingStatus.attended : BookingStatus.no_show;

  let previousStatus: BookingStatus;
  try {
    const before = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { status: true },
    });
    previousStatus = before.status;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        // Only write the method when one was supplied — never blank out a
        // method staff already recorded.
        ...(opts.method != null ? { onsiteMethod: opts.method } : {}),
      },
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

  return {
    ok: true,
    depositBurned: outcome === "no_show",
    previousStatus,
  };
}
