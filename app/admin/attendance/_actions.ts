"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { markAttendance } from "@/lib/booking";
import { getAdminUser } from "@/lib/auth/getAdminUser";

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
  const admin = await getAdminUser();
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
