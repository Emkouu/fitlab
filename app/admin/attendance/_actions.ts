"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { markAttendance } from "@/lib/booking";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { DEPOSIT_UNIT_MINOR } from "@/lib/deposit";
import {
  isClassFeeMethod,
  type ClassFeeMethod,
} from "@/lib/payments/classFeeMethods";
import { BookingStatus } from "@/lib/generated/prisma/enums";

export type MarkAttendanceActionResult =
  | { ok: true; depositBurned: boolean; depositRestored: boolean }
  | {
      ok: false;
      reason: "forbidden" | "not_found" | "invalid";
      message: string;
    };

/**
 * Admin attendance action. Re-checks staff role server-side on every call —
 * never trust the client, never trust middleware alone.
 *
 * „Дойде" also records how the class fee was paid on site (subscription |
 * cash | multisport) and leaves the deposit alone — it stays on the profile
 * for the next booking.
 *
 * Money side (the engine only returns the verdict, CLAUDE.md):
 *   → no_show   : burn one deposit, unless an earlier no_show mark on this
 *                 booking already burned it.
 *   → attended  : restore the deposit if this call corrects an earlier
 *                 no_show, so a mis-tap never costs the client €10.
 */
export async function markAttendanceAction(input: {
  bookingId: string;
  outcome: "attended" | "no_show";
  /** Class-fee method, recorded when marking „Дойде". */
  method?: ClassFeeMethod;
}): Promise<MarkAttendanceActionResult> {
  const admin = await getStaffUser();
  if (!admin) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Нямаш достъп до тази операция.",
    };
  }

  if (input.method !== undefined && !isClassFeeMethod(input.method)) {
    return {
      ok: false,
      reason: "invalid",
      message: "Невалиден начин на плащане.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, scheduledClassId: true, userId: true },
  });
  if (!booking) {
    return {
      ok: false,
      reason: "not_found",
      message: "Записването не е намерено.",
    };
  }

  const result = await markAttendance(prisma, input.bookingId, input.outcome, {
    method: input.outcome === "attended" ? input.method ?? null : null,
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: "not_found",
      message: result.message,
    };
  }

  const wasNoShow = result.previousStatus === BookingStatus.no_show;
  let depositBurned = false;
  let depositRestored = false;

  if (input.outcome === "no_show" && !wasNoShow) {
    // Burn exactly one deposit, clamped at 0 — the conditional WHERE keeps the
    // read-check-decrement atomic so a double tap can't drive it negative.
    const burn = await prisma.user.updateMany({
      where: { id: booking.userId, depositBalance: { gte: DEPOSIT_UNIT_MINOR } },
      data: { depositBalance: { decrement: DEPOSIT_UNIT_MINOR } },
    });
    depositBurned = burn.count > 0;
  } else if (input.outcome === "attended" && wasNoShow) {
    await prisma.user.update({
      where: { id: booking.userId },
      data: { depositBalance: { increment: DEPOSIT_UNIT_MINOR } },
    });
    depositRestored = true;
  }

  console.log(
    `[admin-audit] markAttendance by=${admin.id} booking=${booking.id} outcome=${input.outcome} method=${input.method ?? "—"} burned=${depositBurned} restored=${depositRestored}`,
  );

  revalidatePath("/admin/attendance");
  revalidatePath(`/admin/attendance/${booking.scheduledClassId}`);
  revalidatePath(`/admin/clients/${booking.userId}`);

  return { ok: true, depositBurned, depositRestored };
}

export type SetPaymentMethodResult =
  | { ok: true; settled: boolean }
  | { ok: false; reason: "forbidden" | "not_found" | "invalid"; message: string };

/**
 * Records / corrects how the CLASS FEE was paid on site for a booking, and
 * optionally whether it has been settled at the desk. Staff-gated.
 *
 * Editable after attendance is marked on purpose: if the wrong person on the
 * list got charged, staff must be able to fix the method afterwards. Never
 * touches the deposit.
 */
export async function setPaymentMethodAction(input: {
  bookingId: string;
  method: ClassFeeMethod;
  /** Omit to leave the settled flag untouched. */
  settled?: boolean;
}): Promise<SetPaymentMethodResult> {
  const staff = await getStaffUser();
  if (!staff) {
    return { ok: false, reason: "forbidden", message: "Нямаш достъп до тази операция." };
  }

  if (!isClassFeeMethod(input.method)) {
    return { ok: false, reason: "invalid", message: "Невалиден начин на плащане." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, scheduledClassId: true, depositSettledAt: true },
  });
  if (!booking) {
    return { ok: false, reason: "not_found", message: "Записването не е намерено." };
  }

  const settled =
    input.settled === undefined ? booking.depositSettledAt !== null : input.settled;

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      onsiteMethod: input.method,
      depositSettledAt: settled ? booking.depositSettledAt ?? new Date() : null,
    },
  });

  console.log(
    `[admin-audit] setPaymentMethod by=${staff.id} booking=${booking.id} method=${input.method} settled=${settled}`,
  );

  revalidatePath("/admin/attendance");
  revalidatePath(`/admin/attendance/${booking.scheduledClassId}`);

  return { ok: true, settled };
}
