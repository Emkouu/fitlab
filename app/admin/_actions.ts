"use server";

import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import {
  classFormSchema,
  type ClassFormInput,
} from "@/lib/validation/classForm";
import {
  trainerFormSchema,
  type TrainerFormInput,
} from "@/lib/validation/trainerForm";
import { sofiaToUtc } from "@/lib/format/sofiaTime";

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

export type UpsertClassResult =
  | {
      ok: true;
      classId: string;
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

    // ─── Convert deposit EUR to cents ────────────────────────────────────
    const depositAmount = Math.round(parseFloat(validatedInput.depositEur) * 100);

    // ─── Determine create vs update ──────────────────────────────────────
    const isCreate = !validatedInput.classId || validatedInput.classId === "";

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
          // practiceId and studioId are not updated (immutable)
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

  try {
    // ─── Check if trainer is used in any ScheduledClass ────────────────────
    const classCount = await prisma.scheduledClass.count({
      where: {
        trainers: {
          some: {
            id: trainerId,
          },
        },
      },
    });

    if (classCount > 0) {
      return {
        ok: false,
        reason: "trainer_in_use",
        message: "Не може да изтриеш: треньор е закрепен за класове.",
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
