import { prisma } from "@/lib/db";
import { getResend } from "@/lib/email/resend";
import { ClassReminder } from "@/emails/ClassReminder";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

export type ReminderType = "24h" | "2h";

const ACTIVE_STATUSES = ["booked", "pending_deposit", "paid"] as const;

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";

const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";
const LOGO_URL =
  process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/logo.png`
    : "https://fitlabvarna.com/logo.png";

function subjectFor(type: ReminderType, practiceName: string, timeText: string) {
  return type === "24h"
    ? `Утре те чакаме — ${practiceName} в ${timeText}`
    : `До 2 часа — ${practiceName} в ${timeText}`;
}

export async function sendClassReminder(
  bookingId: string,
  type: ReminderType,
): Promise<{ ok: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    console.error("[reminders] RESEND_API_KEY not set; skipping send", { bookingId, type });
    return { ok: false };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      scheduledClass: {
        include: {
          practice: true,
          studio: true,
          trainers: true,
        },
      },
    },
  });

  if (!booking) {
    console.error("[reminders] booking not found", { bookingId, type });
    return { ok: false };
  }

  // Guard against status changes between scheduling and send.
  if (!ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number])) {
    console.log("[reminders] skipping non-active booking", {
      bookingId,
      type,
      status: booking.status,
    });
    return { ok: false };
  }

  const email = booking.user.email;
  if (!email) {
    console.error("[reminders] user has no email", { bookingId, userId: booking.userId });
    return { ok: false };
  }

  const cls = booking.scheduledClass;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const trainersText =
    cls.trainers.length > 0 ? cls.trainers.map((t) => t.name).join(" & ") : "—";

  const accountUrl =
    (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000") +
    "/account";

  const reactNode = ClassReminder({
    greetingName: booking.user.fullName,
    practiceName: cls.practice.name,
    dateText,
    timeText: `${timeText} ч.`,
    durationMinutes: cls.durationMinutes,
    trainersText,
    studioName: cls.studio.name,
    studioAddress: STUDIO_ADDRESS,
    cancelWindowHours: cls.studio.cancelWindowHours,
    pendingDeposit: booking.status === "pending_deposit",
    accountUrl,
    logoUrl: LOGO_URL,
    footerSite: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: subjectFor(type, cls.practice.name, timeText),
      react: reactNode,
    });

    if (result.error) {
      console.error("[reminders] resend error", { bookingId, type, error: result.error });
      return { ok: false };
    }

    console.log("[reminders] sent", { bookingId, type, to: email, id: result.data?.id });
    return { ok: true };
  } catch (err) {
    console.error("[reminders] send threw", { bookingId, type, err });
    return { ok: false };
  }
}
