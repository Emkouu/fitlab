import { prisma } from "@/lib/db";
import { getResend } from "@/lib/email/resend";
import { BookingConfirmation } from "@/emails/BookingConfirmation";
import { formatSofiaDay, formatSofiaTime, formatEurMinor } from "@/lib/format";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";

const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";
const LOGO_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/logo.png`
  : "https://fitlabvarna.com/logo.png";

function depositStatusText(source: string, status: string): string {
  if (source === "card" && status === "paid") return "Платено онлайн";
  if (source === "balance") return "Платено с баланс";
  if (source === "onsite_deposit") return "Ще платиш на място";
  return "Очаква плащане";
}

/**
 * Send a one-shot booking confirmation email. Safe to call after any of:
 *   - balance/onsite booking creation (status: booked | pending_deposit)
 *   - Stripe webhook flipping a card booking to `paid`
 * Skips silently if RESEND_API_KEY is not set or the user has no email.
 */
export async function sendBookingConfirmationEmail(
  bookingId: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[booking-confirmation] RESEND_API_KEY not set; skipping", {
      bookingId,
    });
    return;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      scheduledClass: {
        include: {
          practice: true,
          studio: true,
          trainers: { orderBy: { name: "asc" } },
        },
      },
    },
  });

  if (!booking) {
    console.error("[booking-confirmation] booking not found", { bookingId });
    return;
  }

  const email = booking.user.email;
  if (!email) {
    console.warn("[booking-confirmation] user has no email; skipping", {
      bookingId,
      userId: booking.userId,
    });
    return;
  }

  const cls = booking.scheduledClass;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const trainersText =
    cls.trainers.length > 0 ? cls.trainers.map((t) => t.name).join(" & ") : "—";

  const accountUrl =
    (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000") +
    "/account";

  const reactNode = BookingConfirmation({
    greetingName: booking.user.fullName,
    practiceName: cls.practice.name,
    dateText,
    timeText: `${timeText} ч.`,
    durationMinutes: cls.durationMinutes,
    trainersText,
    studioName: cls.studio.name,
    studioAddress: STUDIO_ADDRESS,
    depositText: formatEurMinor(cls.depositAmount),
    depositStatusText: depositStatusText(booking.source, booking.status),
    cancelWindowHours: cls.studio.cancelWindowHours,
    accountUrl,
    logoUrl: LOGO_URL,
    footerSite: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `Записан/а си! ${cls.practice.name} — ${dateText} в ${timeText}`,
      react: reactNode,
    });

    if (result.error) {
      console.error("[booking-confirmation] resend error", {
        bookingId,
        error: result.error,
      });
      return;
    }
    console.log("[booking-confirmation] sent", {
      bookingId,
      to: email,
      id: result.data?.id,
    });
  } catch (err) {
    console.error("[booking-confirmation] send threw", { bookingId, err });
  }
}
