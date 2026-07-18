"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import {
  BookingSource,
  BookingStatus,
  PaymentStatus,
  Role,
} from "@/lib/generated/prisma/enums";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ACTIVE_BOOKING_STATUSES, cancelBooking } from "@/lib/booking";
import { notifyWaitlist } from "@/lib/notifications/notifyWaitlist";
import { notifyClassCancelled } from "@/lib/notifications/notifyClassCancelled";
import {
  classFormSchema,
  type ClassFormInput,
} from "@/lib/validation/classForm";
import {
  trainerFormSchema,
  type TrainerFormInput,
} from "@/lib/validation/trainerForm";
import {
  adminCancelBookingSchema,
  type AdminCancelBookingInput,
  updateClientSchema,
  type UpdateClientInput,
  addClientSchema,
  type AddClientInput,
} from "@/lib/validation/clientForm";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import {
  practiceFormSchema,
  type PracticeFormInput,
} from "@/lib/validation/practiceForm";
import {
  studioSettingsSchema,
  type StudioSettingsInput,
} from "@/lib/validation/studioSettingsForm";
import {
  partnerFormSchema,
  type PartnerFormInput,
} from "@/lib/validation/partnerForm";
import { generateSlug } from "@/lib/utils/slug";
import { sofiaToUtc } from "@/lib/format/sofiaTime";
import { sofiaDateKey } from "@/lib/format";
import { generateRecurringDates } from "@/lib/schedule/generateRecurringDates";

const MAX_RECURRENCE_CLASSES = 50;
const MAX_RECURRENCE_RANGE_MS = 1000 * 60 * 60 * 24 * 31 * 3; // ~3 months

export type CancelClassResult =
  | {
      ok: true;
      refundedCount: number;
      refundedBookingIds: string[];
      message: string;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

/**
 * Admin server action: cancel a class and refund all active bookings.
 *
 * Flow:
 * 1. Verify admin access
 * 2. Mark ScheduledClass.cancelledAt = now
 * 3. Find all active bookings (booked, pending_deposit, paid, attended)
 * 4. For each booking:
 *    - Card + paid → initiate Stripe refund
 *    - Balance → restore User.depositBalance
 *    - On-site → no-op
 * 5. Set all bookings to status = 'cancelled'
 * 6. Return refund summary
 *
 * Errors are logged but don't block the class cancellation or other refunds.
 */
export async function cancelClassAction(
  classId: string,
): Promise<CancelClassResult> {
  // ─── Admin gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Нямаш достъп до тази функция.",
    };
  }
  // Destructive + moves real money (mass Stripe refunds) → super_admin only.
  if (admin.role !== Role.super_admin) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Само super admin може да отменя класове.",
    };
  }

  try {
    // ─── DB transaction: cancel class, restore balances, cancel bookings ───
    // Stripe calls are deliberately kept OUT of this transaction — network
    // I/O inside a Prisma $transaction holds a DB connection for the entire
    // duration of the HTTP round-trip(s) to Stripe and can deadlock under
    // load. We commit the local truth first, then settle with Stripe.
    const { activeBookings, cardRefundCandidates, balanceRestoredIds } =
      await prisma.$transaction(async (tx) => {
        const now = new Date();

        // 1. Mark class as cancelled
        const scheduledClass = await tx.scheduledClass.update({
          where: { id: classId },
          data: { cancelledAt: now },
        });

        // 2. Find all active bookings on this class
        const activeBookings = await tx.booking.findMany({
          where: {
            scheduledClassId: classId,
            status: { in: ACTIVE_BOOKING_STATUSES },
          },
          include: {
            payment: { select: { id: true, stripePaymentIntentId: true } },
          },
        });

        // 3. Restore depositBalance for balance-source bookings (atomic with
        //    the cancel below — if either fails, we don't want to credit
        //    users for bookings that aren't actually cancelled).
        const balanceRestoredIds: string[] = [];
        for (const booking of activeBookings) {
          if (booking.source === "balance") {
            await tx.user.update({
              where: { id: booking.userId },
              data: {
                depositBalance: {
                  increment: scheduledClass.depositAmount,
                },
              },
            });
            balanceRestoredIds.push(booking.id);
          }
        }

        // 4. Cancel all active bookings on this class
        await tx.booking.updateMany({
          where: {
            scheduledClassId: classId,
            status: { in: ACTIVE_BOOKING_STATUSES },
          },
          data: {
            status: BookingStatus.cancelled,
            cancelledAt: now,
          },
        });

        // 5. Collect card+paid bookings that need a Stripe refund after commit.
        const cardRefundCandidates = activeBookings
          .filter(
            (b) =>
              b.source === "card" &&
              b.status === BookingStatus.paid &&
              b.payment?.stripePaymentIntentId &&
              b.paymentId,
          )
          .map((b) => ({
            bookingId: b.id,
            paymentId: b.paymentId!,
            paymentIntentId: b.payment!.stripePaymentIntentId!,
          }));

        return { activeBookings, cardRefundCandidates, balanceRestoredIds };
      });

    // ─── Post-commit: settle Stripe refunds outside the DB transaction ──
    // The bookings are already cancelled. A failed refund does NOT roll the
    // DB back; we log and surface a partial-success count so the admin can
    // reconcile manually from Stripe's dashboard.
    const refundedCardBookingIds: string[] = [];
    for (const candidate of cardRefundCandidates) {
      try {
        await stripe.refunds.create({
          payment_intent: candidate.paymentIntentId,
        });
        await prisma.payment.update({
          where: { id: candidate.paymentId },
          data: { status: PaymentStatus.refunded },
        });
        refundedCardBookingIds.push(candidate.bookingId);
      } catch (error) {
        console.error(
          `[cancelClass] Stripe refund failed for booking ${candidate.bookingId} (paymentIntent=${candidate.paymentIntentId}). The booking is already cancelled; refund must be reconciled manually.`,
          error,
        );
        // Continue: don't block other refunds.
      }
    }

    // On-site bookings need no money action; count them as "settled" so the
    // total matches what staff sees in the UI.
    const onsiteSettledIds = activeBookings
      .filter((b) => b.source === "onsite_deposit")
      .map((b) => b.id);

    const refundedBookingIds = [
      ...refundedCardBookingIds,
      ...balanceRestoredIds,
      ...onsiteSettledIds,
    ];

    // Tell the affected clients their class is off (in-app bell + email).
    // Best-effort — the cancellation + refunds are already committed.
    try {
      await notifyClassCancelled(
        classId,
        activeBookings.map((b) => b.userId),
      );
    } catch (err) {
      console.error("[cancelClass] notifyClassCancelled failed", err);
    }

    revalidatePath("/schedule");
    revalidatePath("/admin/schedule");

    return {
      ok: true,
      refundedCount: refundedBookingIds.length,
      refundedBookingIds,
      message: `Класът е отказан. ${refundedBookingIds.length} депозита са върнати.`,
    };
  } catch (error) {
    console.error("[cancelClass] Error cancelling class:", error);
    return {
      ok: false,
      reason: "transaction_failed",
      message: "Възникна грешка при отмяна на класа. Опитай отново.",
    };
  }
}

export type DeleteClassResult =
  | { ok: true; message: string }
  | { ok: false; reason: string; message: string };

/**
 * Admin server action: permanently delete a class from the schedule.
 *
 * Cancel keeps the row and shows „Отказано"; delete removes it entirely —
 * for classes created by mistake or cancelled ones the studio wants gone.
 *
 * Guards (in order):
 * 1. super_admin only (destructive).
 * 2. No ACTIVE bookings — admin must cancel the class first so the refund
 *    routing (Stripe/balance/on-site) runs through the audited cancel path.
 * 3. No paid/refunded Payment rows on any of its bookings — the payment
 *    register must survive ≥13 months (acquirer instruction §III). Classes
 *    that ever took card money stay cancel-only.
 *
 * Cascade: notifications + waitlist rows + (cancelled/swept) bookings and
 * their never-charged pending Payment rows die with the class.
 */
export async function deleteClassAction(
  classId: string,
): Promise<DeleteClassResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, reason: "unauthorized", message: "Нямаш достъп до тази функция." };
  }
  if (admin.role !== Role.super_admin) {
    return { ok: false, reason: "forbidden", message: "Само super admin може да изтрива класове." };
  }

  const cls = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      bookings: {
        select: {
          id: true,
          status: true,
          paymentId: true,
          payment: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!cls) {
    return { ok: false, reason: "not_found", message: "Класът не е намерен." };
  }

  const activeCount = cls.bookings.filter((b) =>
    (ACTIVE_BOOKING_STATUSES as BookingStatus[]).includes(b.status),
  ).length;
  if (activeCount > 0) {
    return {
      ok: false,
      reason: "active_bookings",
      message: `Класът има ${activeCount} активни записвания. Първо го отмени (връща депозитите), после го изтрий.`,
    };
  }

  const hasMoneyRecords = cls.bookings.some(
    (b) =>
      b.payment &&
      (b.payment.status === PaymentStatus.paid ||
        b.payment.status === PaymentStatus.refunded),
  );
  if (hasMoneyRecords) {
    return {
      ok: false,
      reason: "payment_records",
      message:
        "По класа има картови плащания — записите се пазят минимум 13 месеца. Класът може само да бъде отменен.",
    };
  }

  // Pending Payment rows (checkout started, never paid) can go with the class.
  const pendingPaymentIds = cls.bookings
    .map((b) => b.payment?.id)
    .filter((id): id is string => !!id);

  try {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { scheduledClassId: classId } }),
      prisma.waitlist.deleteMany({ where: { scheduledClassId: classId } }),
      prisma.booking.deleteMany({ where: { scheduledClassId: classId } }),
      ...(pendingPaymentIds.length
        ? [prisma.payment.deleteMany({ where: { id: { in: pendingPaymentIds } } })]
        : []),
      prisma.scheduledClass.delete({ where: { id: classId } }),
    ]);
  } catch (error) {
    console.error("[deleteClass] Error deleting class:", error);
    return {
      ok: false,
      reason: "transaction_failed",
      message: "Възникна грешка при изтриване на класа. Опитай отново.",
    };
  }

  console.log(
    `[admin-audit] deleteClass by=${admin.id} class=${classId} startAt=${cls.startAt.toISOString()} bookingsRemoved=${cls.bookings.length}`,
  );

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  revalidatePath("/", "layout");

  return { ok: true, message: "Класът е изтрит от графика." };
}

export type UpsertClassResult =
  | {
      ok: true;
      classId: string;
      count: number;
      message: string;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

/**
 * Admin server action: create or update a scheduled class.
 *
 * Flow:
 * 1. Verify admin access
 * 2. Validate input with classFormSchema
 * 3. Convert Sofia local time to UTC for startAt
 * 4. Convert deposit EUR string to cents
 * 5. Upsert ScheduledClass (create if no classId, update if classId provided)
 * 6. Update trainer M:N junction (disconnect all, connect new trainers)
 * 7. Wrap in transaction for atomicity
 *
 * Returns the created/updated classId on success.
 */
export async function upsertClassAction(
  input: ClassFormInput,
): Promise<UpsertClassResult> {
  // ─── Admin gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Нямаш достъп до тази функция.",
    };
  }

  // ─── Validate input ──────────────────────────────────────────────────────
  const validation = classFormSchema.safeParse(input);
  if (!validation.success) {
    console.error(
      "[upsertClass] Validation errors:",
      validation.error.issues,
    );
    return {
      ok: false,
      reason: "validation_failed",
      message: "Невалидни данни. Проверете полетата.",
    };
  }

  const validatedInput = validation.data;

  try {
    // ─── Convert Sofia time to UTC ───────────────────────────────────────
    const startAtUtc = sofiaToUtc(validatedInput.date, validatedInput.time);

    // ─── Re-check the 30-minute lead time on the server (safety net) ─────
    const earliest = new Date(Date.now() + 30 * 60 * 1000);
    if (startAtUtc < earliest) {
      return {
        ok: false,
        reason: "validation_failed",
        message: "Часът трябва да е поне 30 минути в бъдещето.",
      };
    }

    // ─── Convert deposit EUR to cents ────────────────────────────────────
    const depositAmount = Math.round(parseFloat(validatedInput.depositEur) * 100);

    // ─── Determine create vs update ──────────────────────────────────────
    const isCreate = !validatedInput.classId || validatedInput.classId === "";

    // ─── Recurring path: only on create ──────────────────────────────────
    if (isCreate && validatedInput.recurrence) {
      const startKey = sofiaDateKey(validatedInput.date);
      const { weekdays, endDate } = validatedInput.recurrence;

      const startMs = new Date(`${startKey}T00:00:00Z`).getTime();
      const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
      if (endMs < startMs) {
        return {
          ok: false as const,
          reason: "validation_failed",
          message: "Крайната дата трябва да е след началната.",
        };
      }
      if (endMs - startMs > MAX_RECURRENCE_RANGE_MS) {
        return {
          ok: false as const,
          reason: "validation_failed",
          message: "Периодът не може да надвишава 3 месеца.",
        };
      }

      const dateKeys = generateRecurringDates(startKey, endDate, weekdays);
      if (dateKeys.length === 0) {
        return {
          ok: false as const,
          reason: "validation_failed",
          message: "Няма дати, които да съвпадат с избраните дни.",
        };
      }
      if (dateKeys.length > MAX_RECURRENCE_CLASSES) {
        return {
          ok: false as const,
          reason: "validation_failed",
          message: `Прекалено много класове (${dateKeys.length}). Максимум ${MAX_RECURRENCE_CLASSES}.`,
        };
      }

      const depositAmount = Math.round(
        parseFloat(validatedInput.depositEur) * 100,
      );
      const earliest = new Date(Date.now() + 30 * 60 * 1000);

      const created = await prisma.$transaction(async (tx) => {
        const practice = await tx.practice.findUnique({
          where: { id: validatedInput.practiceId },
        });
        if (!practice) throw new Error("PRACTICE_NOT_FOUND");

        const trainers = await tx.trainer.findMany({
          where: { id: { in: validatedInput.trainerIds } },
        });
        if (trainers.length !== validatedInput.trainerIds.length) {
          throw new Error("TRAINER_NOT_FOUND");
        }

        const studio = await tx.studio.findUnique({
          where: { slug: "fitlab-varna" },
        });
        if (!studio) throw new Error("STUDIO_NOT_FOUND");

        const ids: string[] = [];
        for (const key of dateKeys) {
          const [y, m, d] = key.split("-").map(Number);
          const startAt = sofiaToUtc(
            new Date(Date.UTC(y, m - 1, d)),
            validatedInput.time,
          );
          // Skip past dates to be safe.
          if (startAt < earliest) continue;

          const row = await tx.scheduledClass.create({
            data: {
              startAt,
              durationMinutes: parseInt(validatedInput.duration, 10),
              capacity: validatedInput.capacity,
              depositAmount,
              isSpecialEvent: validatedInput.isSpecialEvent,
              eventNotes: validatedInput.eventNotes || null,
              practiceId: validatedInput.practiceId,
              studioId: studio.id,
              trainers: {
                connect: validatedInput.trainerIds.map((id) => ({ id })),
              },
            },
          });
          ids.push(row.id);
        }
        return ids;
      });

      if (created.length === 0) {
        return {
          ok: false as const,
          reason: "validation_failed",
          message: "Всички дати са в миналото.",
        };
      }

      return {
        ok: true as const,
        classId: created[0],
        count: created.length,
        message: `Създадени са ${created.length} класа успешно.`,
      };
    }

    // ─── Transaction: upsert class + update trainers ─────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify practice exists
      const practice = await tx.practice.findUnique({
        where: { id: validatedInput.practiceId },
      });
      if (!practice) {
        throw new Error("PRACTICE_NOT_FOUND");
      }

      // 2. Verify all trainers exist
      const trainers = await tx.trainer.findMany({
        where: { id: { in: validatedInput.trainerIds } },
      });
      if (trainers.length !== validatedInput.trainerIds.length) {
        throw new Error("TRAINER_NOT_FOUND");
      }

      // 3. Get studio ID (lookup by slug, not hardcoded string)
      const studio = await tx.studio.findUnique({
        where: { slug: "fitlab-varna" },
      });
      if (!studio) {
        throw new Error("STUDIO_NOT_FOUND");
      }

      // 4. Upsert the ScheduledClass
      const scheduledClass = await tx.scheduledClass.upsert({
        where: {
          id: isCreate ? "NEW_CLASS_ID_PLACEHOLDER_UNUSED" : validatedInput.classId!,
        },
        create: {
          startAt: startAtUtc,
          durationMinutes: parseInt(validatedInput.duration, 10),
          capacity: validatedInput.capacity,
          depositAmount,
          isSpecialEvent: validatedInput.isSpecialEvent,
          eventNotes: validatedInput.eventNotes || null,
          practiceId: validatedInput.practiceId,
          studioId: studio.id, // Use actual studio ID from lookup
          trainers: {
            connect: validatedInput.trainerIds.map((id) => ({ id })),
          },
        },
        update: {
          startAt: startAtUtc,
          durationMinutes: parseInt(validatedInput.duration, 10),
          capacity: validatedInput.capacity,
          depositAmount,
          isSpecialEvent: validatedInput.isSpecialEvent,
          eventNotes: validatedInput.eventNotes || null,
          practice: { connect: { id: validatedInput.practiceId } },
          trainers: {
            set: validatedInput.trainerIds.map((id) => ({ id })),
          },
        },
      });

      return scheduledClass;
    });

    return {
      ok: true,
      classId: result.id,
      count: 1,
      message: isCreate ? "Класът е създаден успешно." : "Класът е обновен успешно.",
    };
  } catch (error) {
    console.error("[upsertClass] Error upserting class:", error);

    // ─── Map specific errors ────────────────────────────────────────────
    if (error instanceof Error) {
      if (error.message === "PRACTICE_NOT_FOUND") {
        return {
          ok: false,
          reason: "practice_not_found",
          message: "Практиката не е намерена.",
        };
      }
      if (error.message === "STUDIO_NOT_FOUND") {
        return {
          ok: false,
          reason: "studio_not_found",
          message: "Студиото не е намерено. Контактувай админ.",
        };
      }
      if (error.message === "TRAINER_NOT_FOUND") {
        return {
          ok: false,
          reason: "trainer_not_found",
          message: "Един от треньорите не е намерен.",
        };
      }
    }

    return {
      ok: false,
      reason: "transaction_failed",
      message: "Възникна грешка при запазване. Опитай отново.",
    };
  }
}

export type DeleteTrainerResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

export type UpsertTrainerResult =
  | {
      ok: true;
      trainerId: string;
      message: string;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

/**
 * Admin server action: create or update a trainer.
 *
 * Flow:
 * 1. Validate input with trainerFormSchema
 * 2. Role gate: verify admin access
 * 3. Determine mode (create vs update) based on trainerId
 * 4. Transaction:
 *    a. Create or update Trainer row (name, photoUrl, bio)
 *    b. Update specialties junction with atomic replacement
 *    c. Handle user linking (link/unlink trainer)
 * 5. Return trainerId on success
 *
 * Returns the created/updated trainerId on success.
 */
export async function upsertTrainerAction(
  input: TrainerFormInput,
): Promise<UpsertTrainerResult> {
  // ─── Validate input ──────────────────────────────────────────────────────
  const validation = trainerFormSchema.safeParse(input);
  if (!validation.success) {
    console.error(
      "[upsertTrainer] Validation errors:",
      validation.error.issues,
    );
    return {
      ok: false,
      reason: "validation_failed",
      message: "Невалидни данни. Проверете полетата.",
    };
  }

  const validatedInput = validation.data;

  // ─── Admin gate ────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Нямаш достъп до тази функция.",
    };
  }

  // ─── Determine create vs update ─────────────────────────────────────────
  const isCreate = !validatedInput.trainerId || validatedInput.trainerId === "";

  try {
    // ─── Transaction: upsert trainer + update specialties + link user ──────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or update Trainer row (without specialties, handle them separately)
      const trainer = await tx.trainer.upsert({
        where: {
          id: isCreate ? "NEW_TRAINER_ID_PLACEHOLDER_UNUSED" : validatedInput.trainerId!,
        },
        create: {
          name: validatedInput.name,
          photoUrl: validatedInput.photoUrl || null,
          bio: validatedInput.bio || null,
        },
        update: {
          name: validatedInput.name,
          photoUrl: validatedInput.photoUrl || null,
          bio: validatedInput.bio || null,
        },
      });

      // 2. Verify all selected specialties exist
      const specialties = await tx.practice.findMany({
        where: { id: { in: validatedInput.specialtyIds } },
        select: { id: true },
      });
      if (specialties.length !== validatedInput.specialtyIds.length) {
        throw new Error("SPECIALTY_NOT_FOUND");
      }

      // 3. Handle specialties (many-to-many relation)
      // Clear existing specialties and add new ones
      await tx.trainer.update({
        where: { id: trainer.id },
        data: {
          specialties: {
            set: validatedInput.specialtyIds.map((id) => ({ id })),
          },
        },
      });

      // 4. Handle user linking/unlinking
      await tx.user.updateMany({
        where: { trainerId: trainer.id },
        data: { trainerId: null },
      });

      if (validatedInput.linkedUserId) {
        const user = await tx.user.findUnique({
          where: { id: validatedInput.linkedUserId },
          select: { id: true, trainerId: true },
        });
        if (!user) {
          throw new Error("USER_NOT_FOUND");
        }
        if (user.trainerId && user.trainerId !== trainer.id) {
          throw new Error("USER_ALREADY_LINKED");
        }

        // Link the trainer to the user
        await tx.user.update({
          where: { id: validatedInput.linkedUserId },
          data: { trainerId: trainer.id },
        });
      }

      return trainer;
    });

    return {
      ok: true,
      trainerId: result.id,
      message: isCreate ? "Треньорът е създаден успешно." : "Треньорът е обновен успешно.",
    };
  } catch (error) {
    console.error("[upsertTrainer] Error upserting trainer:", error);

    if (error instanceof Error) {
      if (error.message === "SPECIALTY_NOT_FOUND") {
        return {
          ok: false,
          reason: "specialty_not_found",
          message: "Една от специалностите не е намерена.",
        };
      }
      if (error.message === "USER_NOT_FOUND") {
        return {
          ok: false,
          reason: "user_not_found",
          message: "Потребителят не е намерен.",
        };
      }
      if (error.message === "USER_ALREADY_LINKED") {
        return {
          ok: false,
          reason: "user_already_linked",
          message: "Този потребител вече е свързан с друг треньор.",
        };
      }
    }

    return {
      ok: false,
      reason: "transaction_failed",
      message: "Възникна грешка при запазване. Опитай отново.",
    };
  }
}

/**
 * Admin server action: delete a trainer.
 *
 * Flow:
 * 1. Verify admin access
 * 2. Check if trainer is used in any ScheduledClass
 * 3. If in use: return error
 * 4. If not used:
 *    a. Unlink any linked user
 *    b. Delete trainer
 * 5. Return success or error
 */
export async function deleteTrainerAction(
  trainerId: string,
): Promise<DeleteTrainerResult> {
  // ─── Admin gate ────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Нямаш достъп до тази функция.",
    };
  }
  // Destructive → super_admin only (CLAUDE.md admin policy).
  if (admin.role !== Role.super_admin) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Само super admin може да изтрива треньори.",
    };
  }

  try {
    // ─── Check if trainer is used in any active (non-cancelled) class ──────
    const activeClassCount = await prisma.scheduledClass.count({
      where: {
        trainers: { some: { id: trainerId } },
        cancelledAt: null,
      },
    });

    if (activeClassCount > 0) {
      return {
        ok: false,
        reason: "trainer_in_use",
        message: `Треньорът води ${activeClassCount} активни класа. Премахни го от класовете, преди да го изтриеш.`,
      };
    }

    // ─── Transaction: unlink user + delete trainer ──────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get trainer first to have the name for the response
      const trainer = await tx.trainer.findUnique({
        where: { id: trainerId },
      });

      if (!trainer) {
        throw new Error("TRAINER_NOT_FOUND");
      }

      // 2. Unlink any user linked to this trainer
      await tx.user.updateMany({
        where: { trainerId: trainerId },
        data: { trainerId: null },
      });

      // 3. Delete trainer
      await tx.trainer.delete({
        where: { id: trainerId },
      });

      return trainer;
    });

    return {
      ok: true,
      message: `Треньорът "${result.name}" е изтрит успешно.`,
    };
  } catch (error) {
    console.error("[deleteTrainer] Error deleting trainer:", error);

    if (error instanceof Error && error.message === "TRAINER_NOT_FOUND") {
      return {
        ok: false,
        reason: "trainer_not_found",
        message: "Треньорът не е намерен.",
      };
    }

    return {
      ok: false,
      reason: "delete_failed",
      message: "Възникна грешка при изтриване. Опитай отново.",
    };
  }
}

/* ───────────────────────── Phase 2b — Client management ───────────────────── */

export type UpdateClientResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Admin server action: update a client's profile fields.
 *
 * Safety rules (CLAUDE.md / Phase 2b spec):
 * - Re-check admin role on every call.
 * - Validate with Zod.
 * - Admin can NOT change their own role (no self-demotion).
 * - Only super_admin may set role = super_admin.
 * - depositBalance is bounded ≥ 0 by the Zod schema.
 * - Email is not editable (Supabase identifier).
 */
export async function updateClientAction(
  input: UpdateClientInput,
): Promise<UpdateClientResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни. Провери полетата." };
  }
  const data = parsed.data;

  if (data.userId === admin.id) {
    // Allow editing own profile fields, but NOT own role.
    const self = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { role: true },
    });
    if (self && self.role !== data.role) {
      return {
        ok: false,
        message: "Не може да променяш собствената си роля.",
      };
    }
  }

  if (data.role === Role.super_admin && admin.role !== Role.super_admin) {
    return { ok: false, message: "Само super admin може да назначава super admin." };
  }

  try {
    await prisma.user.update({
      where: { id: data.userId },
      data: {
        fullName: data.fullName ?? null,
        phone: data.phone ?? null,
        role: data.role,
        depositBalance: data.depositBalance,
      },
    });
  } catch (err) {
    console.error("[updateClient] error:", err);
    return { ok: false, message: "Грешка при запазване. Опитай отново." };
  }

  console.log(
    `[admin-audit] updateClient by=${admin.id} target=${data.userId} role=${data.role} balance=${data.depositBalance}`,
  );

  revalidatePath(`/admin/clients/${data.userId}`);
  revalidatePath("/admin/clients");

  return { ok: true, message: "Промените са запазени." };
}

export type AdminCancelBookingResult =
  | { ok: true; message: string; refundedToBalance: boolean }
  | { ok: false; message: string };

/**
 * Admin server action: cancel a single booking on behalf of a client.
 *
 * Default path → call the engine's cancelBooking; if the engine returns
 * depositForfeited=false AND source is card or balance, credit the user's
 * depositBalance (mirrors the user-side refund routing in SPEC §5).
 *
 * Override path (overrideRefund=true) → bypass the window verdict and
 * credit the deposit anyway (card or balance only — on-site never moves
 * money). Lets admin handle edge cases (sick clients, studio errors).
 */
export async function adminCancelBookingAction(
  input: AdminCancelBookingInput,
): Promise<AdminCancelBookingResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const parsed = adminCancelBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни." };
  }
  const { bookingId, overrideRefund } = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      scheduledClass: { select: { depositAmount: true } },
    },
  });
  if (!booking) {
    return { ok: false, message: "Записването не е намерено." };
  }
  if (booking.status === BookingStatus.cancelled) {
    return { ok: false, message: "Записването вече е отменено." };
  }

  const result = await cancelBooking(prisma, bookingId);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  // Money side: mirror user-side refund routing, with override path.
  const shouldRefund = overrideRefund || !result.depositForfeited;
  let refundedToBalance = false;
  if (
    shouldRefund &&
    (booking.source === BookingSource.card ||
      booking.source === BookingSource.balance)
  ) {
    await prisma.user.update({
      where: { id: booking.userId },
      data: {
        depositBalance: { increment: booking.scheduledClass.depositAmount },
      },
    });
    refundedToBalance = true;
  }

  console.log(
    `[admin-audit] adminCancelBooking by=${admin.id} booking=${bookingId} override=${overrideRefund} forfeited=${result.depositForfeited} refunded=${refundedToBalance}`,
  );

  // Spot just opened up — walk the waitlist.
  try {
    await notifyWaitlist(booking.scheduledClassId);
  } catch (err) {
    console.error("[adminCancelBooking] notifyWaitlist failed", err);
  }

  revalidatePath(`/admin/clients/${booking.userId}`);
  revalidatePath("/admin/clients");

  return {
    ok: true,
    refundedToBalance,
    message: refundedToBalance
      ? "Записването е отменено и депозитът е върнат в баланса."
      : result.depositForfeited
        ? "Записването е отменено. Депозитът е удържан (късно)."
        : "Записването е отменено.",
  };
}

export type DeleteBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Admin server action: permanently delete a single booking row.
 *
 * Cancel is the normal path (keeps history, runs refund routing). Delete is
 * for cleaning up cancelled entries a client/staff created by mistake.
 *
 * Guards:
 * 1. super_admin only (destructive).
 * 2. Booking must already be cancelled — active bookings go through the
 *    „Анулирай" path first so refunds are handled; attended/no_show stay as
 *    attendance history.
 * 3. No paid/refunded Payment row — the payment register survives ≥13 months
 *    (acquirer instruction §III). A pending, never-charged row dies with it.
 */
export async function deleteBookingAction(
  bookingId: string,
): Promise<DeleteBookingResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }
  if (admin.role !== Role.super_admin) {
    return { ok: false, message: "Само super admin може да изтрива записвания." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: { select: { id: true, status: true } } },
  });
  if (!booking) {
    return { ok: false, message: "Записването не е намерено." };
  }
  if (booking.status !== BookingStatus.cancelled) {
    return {
      ok: false,
      message: "Само отменени записвания могат да се изтриват. Първо го анулирай.",
    };
  }
  if (
    booking.payment &&
    (booking.payment.status === PaymentStatus.paid ||
      booking.payment.status === PaymentStatus.refunded)
  ) {
    return {
      ok: false,
      message:
        "По записването има картово плащане — записът се пази минимум 13 месеца и не може да се изтрие.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.booking.delete({ where: { id: bookingId } }),
      ...(booking.payment
        ? [prisma.payment.delete({ where: { id: booking.payment.id } })]
        : []),
    ]);
  } catch (error) {
    console.error("[deleteBooking] Error deleting booking:", error);
    return { ok: false, message: "Възникна грешка при изтриване. Опитай отново." };
  }

  console.log(
    `[admin-audit] deleteBooking by=${admin.id} booking=${bookingId} user=${booking.userId} class=${booking.scheduledClassId}`,
  );

  revalidatePath(`/admin/clients/${booking.userId}`);
  revalidatePath("/admin/clients");

  return { ok: true, message: "Записването е изтрито." };
}

/* ───────────────────────── Practice management ───────────────────────── */

export type UpsertPracticeResult =
  | { ok: true; practiceId: string; message: string }
  | { ok: false; message: string };

export async function upsertPracticeAction(
  input: PracticeFormInput,
): Promise<UpsertPracticeResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const parsed = practiceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни. Провери полетата." };
  }
  const data = parsed.data;
  const slug = data.slug || generateSlug(data.name);
  const isCreate = !data.id;

  try {
    const existing = await prisma.practice.findUnique({ where: { slug } });
    if (existing && (isCreate || existing.id !== data.id)) {
      return { ok: false, message: "Slug вече се използва от друга практика." };
    }

    const existingName = await prisma.practice.findUnique({
      where: { name: data.name },
    });
    if (existingName && (isCreate || existingName.id !== data.id)) {
      return { ok: false, message: "Името вече се използва от друга практика." };
    }

    const description = data.description?.trim() ? data.description.trim() : null;

    const practice = isCreate
      ? await prisma.practice.create({
          data: { name: data.name, slug, description },
        })
      : await prisma.practice.update({
          where: { id: data.id! },
          data: { name: data.name, slug, description },
        });

    console.log(
      `[admin-audit] upsertPractice by=${admin.id} practice=${practice.id} mode=${isCreate ? "create" : "update"}`,
    );

    revalidatePath("/admin/practices");

    return {
      ok: true,
      practiceId: practice.id,
      message: isCreate ? "Практиката е създадена." : "Практиката е обновена.",
    };
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return { ok: false, message: "Името или slug вече се използват." };
    }
    console.error("[upsertPractice] error:", err);
    return { ok: false, message: "Грешка при запазване. Опитай отново." };
  }
}

export type DeletePracticeResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deletePracticeAction(
  practiceId: string,
): Promise<DeletePracticeResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }
  // Destructive → super_admin only (CLAUDE.md admin policy).
  if (admin.role !== Role.super_admin) {
    return { ok: false, message: "Само super admin може да изтрива практики." };
  }

  const activeClassCount = await prisma.scheduledClass.count({
    where: { practiceId, cancelledAt: null },
  });
  if (activeClassCount > 0) {
    return {
      ok: false,
      message: `Тази практика се използва в ${activeClassCount} активни класа. Премахни я от класовете, преди да я изтриеш.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.trainer.findMany({
        where: { specialties: { some: { id: practiceId } } },
        select: { id: true },
      }).then(async (trainers) => {
        for (const t of trainers) {
          await tx.trainer.update({
            where: { id: t.id },
            data: { specialties: { disconnect: { id: practiceId } } },
          });
        }
      });
      await tx.practice.delete({ where: { id: practiceId } });
    });
  } catch (err) {
    console.error("[deletePractice] error:", err);
    return { ok: false, message: "Грешка при изтриване. Опитай отново." };
  }

  console.log(`[admin-audit] deletePractice by=${admin.id} practice=${practiceId}`);
  revalidatePath("/admin/practices");

  return { ok: true, message: "Практиката е изтрита." };
}

/* ───────────────────────── Add client (staff incl. coaches) ───────────────────────── */

export type AddClientResult =
  | { ok: true; userId: string; message: string }
  | { ok: false; message: string };

/**
 * Create a bare member User row from the staff panel. Coaches are allowed —
 * this is additive-only (no role/balance edits, those stay admin-only in
 * updateClientAction). The person claims the row on first sign-in via
 * `syncUserFromSupabase` (matches by phone/email).
 */
export async function addClientAction(
  input: AddClientInput,
): Promise<AddClientResult> {
  const staff = await getStaffUser();
  if (!staff) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const parsed = addClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни. Провери полетата." };
  }
  const data = parsed.data;
  const phone = data.phone?.trim() ? data.phone.trim() : null;
  const email = data.email?.trim() ? data.email.trim().toLowerCase() : null;

  // Friendly duplicate check before insert (unique indexes are the backstop).
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
    select: { id: true, fullName: true },
  });
  if (existing) {
    return {
      ok: false,
      message: `Вече има клиент с този телефон/имейл${existing.fullName ? ` (${existing.fullName})` : ""}.`,
    };
  }

  try {
    const user = await prisma.user.create({
      data: {
        fullName: data.fullName.trim(),
        phone,
        email,
        role: Role.member,
      },
    });

    console.log(
      `[admin-audit] addClient by=${staff.id} role=${staff.role} user=${user.id}`,
    );

    revalidatePath("/admin/clients");
    return { ok: true, userId: user.id, message: "Клиентът е добавен." };
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return { ok: false, message: "Телефонът или имейлът вече се използват." };
    }
    console.error("[addClient] error:", err);
    return { ok: false, message: "Грешка при запазване. Опитай отново." };
  }
}

/* ───────────────────────── Loyalty partners ───────────────────────── */

export type UpsertPartnerResult =
  | { ok: true; partnerId: string; message: string }
  | { ok: false; message: string };

export async function upsertPartnerAction(
  input: PartnerFormInput,
): Promise<UpsertPartnerResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const parsed = partnerFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни. Провери полетата." };
  }
  const data = parsed.data;
  const isCreate = !data.id;

  // Normalize optional empties to NULL so the Profile card logic stays simple.
  const payload = {
    name: data.name.trim(),
    description: data.description?.trim() ? data.description.trim() : null,
    logoUrl: data.logoUrl?.trim() ? data.logoUrl.trim() : null,
    siteUrl: data.siteUrl?.trim() ? data.siteUrl.trim() : null,
    promoCode: data.promoCode?.trim() ? data.promoCode.trim() : null,
    active: data.active,
  };

  try {
    const partner = isCreate
      ? await prisma.partner.create({ data: payload })
      : await prisma.partner.update({ where: { id: data.id! }, data: payload });

    console.log(
      `[admin-audit] upsertPartner by=${admin.id} partner=${partner.id} mode=${isCreate ? "create" : "update"}`,
    );

    revalidatePath("/admin/partners");
    revalidatePath("/account");

    return {
      ok: true,
      partnerId: partner.id,
      message: isCreate ? "Партньорът е добавен." : "Партньорът е обновен.",
    };
  } catch (err) {
    console.error("[upsertPartner] error:", err);
    return { ok: false, message: "Грешка при запазване. Опитай отново." };
  }
}

export type DeletePartnerResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deletePartnerAction(
  partnerId: string,
): Promise<DeletePartnerResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }
  // Destructive → super_admin only (CLAUDE.md admin policy). Admins can
  // hide a partner via the active toggle instead.
  if (admin.role !== Role.super_admin) {
    return { ok: false, message: "Само super admin може да изтрива партньори." };
  }

  try {
    await prisma.partner.delete({ where: { id: partnerId } });
  } catch (err) {
    console.error("[deletePartner] error:", err);
    return { ok: false, message: "Грешка при изтриване. Опитай отново." };
  }

  console.log(`[admin-audit] deletePartner by=${admin.id} partner=${partnerId}`);
  revalidatePath("/admin/partners");
  revalidatePath("/account");

  return { ok: true, message: "Партньорът е изтрит." };
}

/* ───────────────────────── Studio settings ───────────────────────── */

export type UpdateStudioSettingsResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateStudioSettingsAction(
  input: StudioSettingsInput,
): Promise<UpdateStudioSettingsResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }
  // Edits studio config → super_admin only (CLAUDE.md admin policy).
  if (admin.role !== Role.super_admin) {
    return { ok: false, message: "Само super admin може да променя настройките." };
  }

  const parsed = studioSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни. Провери полетата." };
  }
  const data = parsed.data;

  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: { id: true },
  });
  if (!studio) {
    return { ok: false, message: "Студиото не е намерено." };
  }

  const defaultDeposit = Math.round(parseFloat(data.defaultDepositEur) * 100);

  try {
    await prisma.studio.update({
      where: { id: studio.id },
      data: {
        name: data.name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        facebookUrl: data.facebookUrl ?? null,
        instagramUrl: data.instagramUrl ?? null,
        cancelWindowHours: data.cancelWindowHours,
        defaultDeposit,
        cardPaymentsEnabled: data.cardPaymentsEnabled,
      },
    });
  } catch (err) {
    console.error("[updateStudioSettings] error:", err);
    return { ok: false, message: "Грешка при запазване. Опитай отново." };
  }

  console.log(
    `[admin-audit] updateStudioSettings by=${admin.id} studio=${studio.id}`,
  );

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  return { ok: true, message: "Настройките са запазени." };
}
