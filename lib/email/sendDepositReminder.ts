import { prisma } from "@/lib/db";
import { deliverEmail } from "@/lib/email/deliver";
import { DepositReminder } from "@/emails/DepositReminder";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { depositAmountMinor } from "@/lib/deposit";
import { isUnfinishedCardDeposit } from "@/lib/booking/unfinishedDeposit";

/**
 * Nudge a client who reached the bank's card page and left without paying.
 *
 * The state is re-checked here rather than trusted from the caller: between the
 * cron picking the row and this send, the client may have paid, cancelled, or
 * the class may have been called off. Sending „плати депозита" to somebody who
 * already paid is worse than sending nothing.
 */
const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";
const STUDIO_PHONE = "088 241 4863";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

const LOGO_URL = `${appUrl()}/logo.png`;

export async function sendDepositReminder(bookingId: string): Promise<{ ok: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { email: true, fullName: true } },
      payment: { select: { status: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          studio: {
            select: { name: true, phone: true, defaultDeposit: true },
          },
        },
      },
    },
  });

  if (!booking) {
    console.error("[deposit-reminder] booking not found", { bookingId });
    return { ok: false };
  }

  // Still an unpaid card hold? The client may have finished paying, or an admin
  // may have cancelled the booking, since the sweep picked this row.
  if (
    !isUnfinishedCardDeposit({
      source: booking.source,
      status: booking.status,
      paymentStatus: booking.payment?.status ?? null,
    })
  ) {
    console.log("[deposit-reminder] no longer unpaid; skipping", {
      bookingId,
      status: booking.status,
    });
    return { ok: false };
  }

  const cls = booking.scheduledClass;
  if (cls.cancelledAt) {
    console.log("[deposit-reminder] class cancelled; skipping", { bookingId });
    return { ok: false };
  }
  if (cls.startAt.getTime() <= Date.now()) {
    console.log("[deposit-reminder] class already started; skipping", { bookingId });
    return { ok: false };
  }

  const email = booking.user.email;
  if (!email) {
    console.error("[deposit-reminder] user has no email", { bookingId });
    return { ok: false };
  }

  const reactNode = DepositReminder({
    greetingName: booking.user.fullName,
    practiceName: cls.practice.name,
    dateText: formatSofiaDay(cls.startAt),
    timeText: `${formatSofiaTime(cls.startAt)} ч.`,
    // The same resolution the modal and /pay used — never a hardcoded amount.
    depositText: formatEurMinor(depositAmountMinor(cls, cls.studio)),
    payUrl: `${appUrl()}/pay/${booking.id}`,
    studioName: cls.studio.name,
    studioAddress: STUDIO_ADDRESS,
    studioPhone: cls.studio.phone ?? STUDIO_PHONE,
    logoUrl: LOGO_URL,
    footerSite: appUrl(),
  });

  const sent = await deliverEmail({
    to: email,
    subject: `Депозитът за ${cls.practice.name} още не е платен`,
    react: reactNode,
    tag: "deposit-reminder",
  });
  if (!sent.ok) {
    console.error("[deposit-reminder] not sent", { bookingId, error: sent.error });
  }
  return { ok: sent.ok };
}
