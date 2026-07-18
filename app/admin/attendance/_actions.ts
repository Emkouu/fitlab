"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { markAttendance } from "@/lib/booking";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { BookingSource } from "@/lib/generated/prisma/enums";

const ONSITE_METHODS = ["cash", "subscription", "multisport"] as const;
type OnsiteMethod = (typeof ONSITE_METHODS)[number];

export type MarkAttendanceActionResult =
  | { ok: true; depositBurned: boolean }
  | {
      ok: false;
      reason: "forbidden" | "not_found";
      message: string;
    };

/**
 * Admin attendance action. Re-checks admin role server-side on every call —
 * never trust the client, never trust middleware alone.
 */
export async function markAttendanceAction(input: {
  bookingId: string;
  outcome: "attended" | "no_show";
}): Promise<MarkAttendanceActionResult> {
  const admin = await getStaffUser();
  if (!admin) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Нямаш достъп до тази операция.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, scheduledClassId: true },
  });
  if (!booking) {
    return {
      ok: false,
      reason: "not_found",
      message: "Записването не е намерено.",
    };
  }

  const result = await markAttendance(prisma, input.bookingId, input.outcome);
  if (!result.ok) {
    return {
      ok: false,
      reason: "not_found",
      message: result.message,
    };
  }

  revalidatePath("/admin/attendance");
  revalidatePath(`/admin/attendance/${booking.scheduledClassId}`);

  return { ok: true, depositBurned: result.depositBurned };
}

export type SetOnsitePaymentResult =
  | { ok: true; settled: boolean }
  | { ok: false; reason: "forbidden" | "not_found" | "invalid"; message: string };

/**
 * Records how an on-site booking is paid at the desk and whether the deposit
 * has been settled ("Разплати"). Staff-gated. Only valid for `onsite_deposit`
 * bookings — payment for card/balance is handled elsewhere. Both fields are
 * independent of attendance status.
 */
export async function setOnsitePaymentAction(input: {
  bookingId: string;
  method: OnsiteMethod;
  settled: boolean;
}): Promise<SetOnsitePaymentResult> {
  const staff = await getStaffUser();
  if (!staff) {
    return { ok: false, reason: "forbidden", message: "Нямаш достъп до тази операция." };
  }

  if (!ONSITE_METHODS.includes(input.method)) {
    return { ok: false, reason: "invalid", message: "Невалиден начин на плащане." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, source: true, scheduledClassId: true },
  });
  if (!booking) {
    return { ok: false, reason: "not_found", message: "Записването не е намерено." };
  }
  if (booking.source !== BookingSource.onsite_deposit) {
    return {
      ok: false,
      reason: "invalid",
      message: "Плащане на място се маркира само за резервации на място.",
    };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      onsiteMethod: input.method,
      depositSettledAt: input.settled ? new Date() : null,
    },
  });

  console.log(
    `[admin-audit] setOnsitePayment by=${staff.id} booking=${booking.id} method=${input.method} settled=${input.settled}`,
  );

  revalidatePath("/admin/attendance");
  revalidatePath(`/admin/attendance/${booking.scheduledClassId}`);

  return { ok: true, settled: input.settled };
}
