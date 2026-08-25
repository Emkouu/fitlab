import { prisma } from "@/lib/db";
import { deliverEmail } from "@/lib/email/deliver";
import { ClassReminder } from "@/emails/ClassReminder";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

export type ReminderType = "24h" | "2h";

const ACTIVE_STATUSES = ["booked", "pending_deposit", "paid"] as const;

const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";
const STUDIO_PHONE = "088 241 4863";
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
    studioPhone: cls.studio.phone ?? STUDIO_PHONE,
    cancelWindowHours: cls.studio.cancelWindowHours,
    pendingDeposit: booking.status === "pending_deposit",
    accountUrl,
    logoUrl: LOGO_URL,
    footerSite: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  const sent = await deliverEmail({
    to: email,
    subject: subjectFor(type, cls.practice.name, timeText),
    react: reactNode,
    tag: "reminders",
  });
  if (!sent.ok) {
    console.error("[reminders] not sent", { bookingId, type, error: sent.error });
  }
  return { ok: sent.ok };
}
