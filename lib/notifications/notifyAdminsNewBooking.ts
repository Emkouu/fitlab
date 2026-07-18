import { prisma } from "@/lib/db";
import { Role, NotificationType } from "@/lib/generated/prisma/enums";
import { getResend } from "@/lib/email/resend";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";

/** UI payment methods → human label for the admin message (all are on-site). */
const METHOD_LABEL: Record<string, string> = {
  cash: "В брой",
  subscription: "Абонаментна карта",
  multisport: "Multisport",
};

/**
 * Notify every admin / super_admin that a new (on-site) booking was made.
 *
 * Two channels (per product decision): an in-app Notification row per admin
 * (surfaces in the schedule bell) AND a single Resend email to all admin
 * addresses. Both are best-effort — failures are logged, never thrown, so a
 * flaky mailer can't roll back or fail the booking that already succeeded.
 *
 * `method` is the UI-level choice (cash | subscription | multisport). It is
 * NOT persisted on the booking (all three map to `onsite_deposit`); we only
 * thread it here so staff know how the client intends to pay at the desk.
 */
export async function notifyAdminsNewBooking(
  bookingId: string,
  method?: string,
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          trainers: { orderBy: { name: "asc" }, select: { name: true } },
        },
      },
    },
  });
  if (!booking) {
    console.error("[notifyAdminsNewBooking] booking not found", { bookingId });
    return;
  }

  const cls = booking.scheduledClass;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const methodLabel = method ? METHOD_LABEL[method] ?? method : "на място";
  const who =
    booking.user.fullName ??
    booking.user.phone ??
    booking.user.email ??
    "Клиент";
  const message = `Нова резервация: ${who} за ${cls.practice.name} на ${dateText} в ${timeText} ч. · плащане: ${methodLabel}.`;

  const admins = await prisma.user.findMany({
    where: { role: { in: [Role.admin, Role.super_admin] } },
    select: { id: true, email: true },
  });
  if (admins.length === 0) return;

  // ── Channel 1: in-app bell ──────────────────────────────────────────────
  for (const admin of admins) {
    try {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.new_booking,
          scheduledClassId: cls.id,
          message,
        },
      });
    } catch (err) {
      console.error("[notifyAdminsNewBooking] in-app create failed", {
        adminId: admin.id,
        bookingId,
        err,
      });
    }
  }

  // ── Channel 2: email to the studio ──────────────────────────────────────
  const recipients = admins
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  if (recipients.length === 0) return;
  if (!process.env.RESEND_API_KEY) {
    console.warn("[notifyAdminsNewBooking] RESEND_API_KEY not set; skipping email", {
      bookingId,
    });
    return;
  }

  const trainersText =
    cls.trainers.length > 0 ? cls.trainers.map((t) => t.name).join(" & ") : "—";
  const contact = booking.user.phone ?? booking.user.email ?? "—";
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e">
      <h2 style="margin:0 0 12px;color:#c2158a">Нова резервация</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Клиент</td><td><strong>${who}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Контакт</td><td>${contact}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Тренировка</td><td>${cls.practice.name}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Треньор</td><td>${trainersText}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Дата</td><td>${dateText} в ${timeText} ч.</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Плащане</td><td><strong>${methodLabel}</strong> (на място)</td></tr>
      </table>
    </div>`;

  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `Нова резервация — ${cls.practice.name} (${dateText}, ${timeText} ч.)`,
      html,
    });
    if (result.error) {
      console.error("[notifyAdminsNewBooking] resend error", {
        bookingId,
        error: result.error,
      });
      return;
    }
    console.log("[notifyAdminsNewBooking] sent", {
      bookingId,
      recipients: recipients.length,
      id: result.data?.id,
    });
  } catch (err) {
    console.error("[notifyAdminsNewBooking] send threw", { bookingId, err });
  }
}
