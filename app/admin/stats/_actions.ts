"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";

export type FiscalizeBurnResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Mark a burned deposit as rung up on the касов апарат — or take the mark back.
 *
 * A burned deposit is the studio's income and has to go through the register,
 * which is a physical act nobody can do from here. What this records is that it
 * happened, so the same €10 is not rung up twice and nothing is quietly missed
 * at the end of a month. That is the entire job of the mark.
 *
 * Three states, all reachable from /admin/stats/burned:
 *  - burned, not marked      → „Чукнат на касата"
 *  - burned, marked          → done; can be un-marked if the tap was wrong
 *  - marked but no longer burned → a corrected no_show gave the money back
 *    after the receipt was printed. The receipt is real, so the row stays and
 *    asks for a сторно until staff confirm they issued one.
 *
 * Financial action → admin-gated (never coaches).
 */
export async function markDepositFiscalizedAction(input: {
  bookingId: string;
  /** true = rung up, false = take the mark back / сторно issued. */
  fiscalized: boolean;
}): Promise<FiscalizeBurnResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { ok: false, message: "Нямаш достъп до тази функция." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      userId: true,
      depositBurnedMinor: true,
      depositFiscalizedAt: true,
    },
  });
  if (!booking) {
    return { ok: false, message: "Записването не е намерено." };
  }

  if (input.fiscalized) {
    if ((booking.depositBurnedMinor ?? 0) <= 0) {
      return {
        ok: false,
        message: "По това записване няма усвоен депозит, който да се чука.",
      };
    }
    if (booking.depositFiscalizedAt) {
      return { ok: true, message: "Вече е отбелязан като чукнат." };
    }
    // The amount is snapshotted, not referenced: correcting a mis-tapped
    // no_show later clears `depositBurnedMinor`, and what has to be сторнирано
    // is what was on the receipt.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        depositFiscalizedAt: new Date(),
        depositFiscalizedMinor: booking.depositBurnedMinor,
      },
    });
  } else {
    if (!booking.depositFiscalizedAt) {
      return { ok: true, message: "Не е отбелязан като чукнат." };
    }
    await prisma.booking.update({
      where: { id: booking.id },
      data: { depositFiscalizedAt: null, depositFiscalizedMinor: null },
    });
  }

  console.log(
    `[admin-audit] markDepositFiscalized by=${admin.id} booking=${booking.id} fiscalized=${input.fiscalized}`,
  );

  revalidatePath("/admin/stats");
  revalidatePath("/admin/stats/burned");
  revalidatePath(`/admin/clients/${booking.userId}`);

  return {
    ok: true,
    message: input.fiscalized
      ? "Отбелязан като чукнат на касата."
      : "Отметката е свалена.",
  };
}
