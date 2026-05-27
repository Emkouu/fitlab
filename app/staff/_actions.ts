"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { markAttendance } from "@/lib/booking";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { Role } from "@/lib/generated/prisma/enums";

export type MarkAttendanceActionResult =
  | { ok: true; depositBurned: boolean }
  | {
      ok: false;
      reason: "forbidden" | "not_found";
      message: string;
    };

/**
 * Server-side attendance action. EVERY call re-checks the role from the DB —
 * we never trust the client's claim of being staff. Coaches additionally
 * can only mark bookings on classes they actually taught; admins +
 * super_admins are unrestricted.
 *
 * Money side: this records the verdict (engine sets booking status to
 * `attended` / `no_show` and returns depositBurned). The actual Stripe
 * refund-on-attended for card-source bookings is intentionally not wired
 * here — per CLAUDE.md's verdict-vs-action note, money mutation belongs in
 * lib/payments/. Wiring it is the last money-side task before MVP cutover.
 */
export async function markAttendanceAction(input: {
  bookingId: string;
  outcome: "attended" | "no_show";
}): Promise<MarkAttendanceActionResult> {
  const staff = await getStaffUser();
  if (!staff) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Нямаш достъп до тази операция.",
    };
  }

  // Coach scoping: load the booking with its class trainers so we can
  // verify ownership. Admins skip the check.
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      scheduledClassId: true,
      scheduledClass: {
        select: { trainers: { select: { id: true } } },
      },
    },
  });
  if (!booking) {
    return {
      ok: false,
      reason: "not_found",
      message: "Записването не е намерено.",
    };
  }

  if (staff.role === Role.coach) {
    const isOwn = booking.scheduledClass.trainers.some(
      (t) => t.id === staff.trainerId,
    );
    if (!isOwn) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Можеш да маркираш само свои класове.",
      };
    }
  }

  const result = await markAttendance(prisma, input.bookingId, input.outcome);
  if (!result.ok) {
    return {
      ok: false,
      reason: "not_found",
      message: result.message,
    };
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/${booking.scheduledClassId}`);

  return { ok: true, depositBurned: result.depositBurned };
}
