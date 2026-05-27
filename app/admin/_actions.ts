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
    // ─── Transaction: cancel class + refund bookings ───────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark class as cancelled
      const scheduledClass = await tx.scheduledClass.update({
        where: { id: classId },
        data: { cancelledAt: new Date() },
      });

      // 2. Find all active bookings on this class
      const activeBookings = await tx.booking.findMany({
        where: {
          scheduledClassId: classId,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        include: {
          user: { select: { id: true, supabaseUserId: true } },
          payment: { select: { id: true, stripePaymentIntentId: true } },
        },
      });

      const refundedBookingIds: string[] = [];

      // 3. Process refunds per source
      for (const booking of activeBookings) {
        // Card deposit: initiate Stripe refund
        if (
          booking.source === "card" &&
          booking.status === BookingStatus.paid &&
          booking.payment?.stripePaymentIntentId
        ) {
          try {
            await stripe.refunds.create({
              payment_intent: booking.payment.stripePaymentIntentId,
            });
            // Mark payment as refunded
            if (booking.paymentId) {
              await tx.payment.update({
                where: { id: booking.paymentId },
                data: { status: PaymentStatus.refunded },
              });
            }
            refundedBookingIds.push(booking.id);
          } catch (error) {
            console.error(
              `[cancelClass] Stripe refund failed for booking ${booking.id}:`,
              error,
            );
            // Continue: don't block other refunds
          }
        }

        // Balance deposit: restore to user's depositBalance
        else if (booking.source === "balance") {
          try {
            await tx.user.update({
              where: { id: booking.userId },
              data: {
                depositBalance: {
                  increment: scheduledClass.depositAmount,
                },
              },
            });
            refundedBookingIds.push(booking.id);
          } catch (error) {
            console.error(
              `[cancelClass] Balance restore failed for booking ${booking.id}:`,
              error,
            );
          }
        }

        // On-site: no action (never charged)
        else if (booking.source === "onsite_deposit") {
          refundedBookingIds.push(booking.id);
        }
      }

      // 4. Set all active bookings to cancelled
      await tx.booking.updateMany({
        where: {
          scheduledClassId: classId,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        data: {
          status: BookingStatus.cancelled,
          cancelledAt: new Date(),
        },
      });

      return {
        totalBookings: activeBookings.length,
        refundedCount: refundedBookingIds.length,
        refundedBookingIds,
      };
    });

    return {
      ok: true,
      refundedCount: result.refundedCount,
      refundedBookingIds: result.refundedBookingIds,
      message: `Класът е отказан. ${result.refundedCount} депозита са върнати.`,
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
