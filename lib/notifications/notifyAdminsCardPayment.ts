import { prisma } from "@/lib/db";
import { Role, NotificationType } from "@/lib/generated/prisma/enums";
import { deliverEmail } from "@/lib/email/deliver";
import {
  formatEurMinor,
  formatSofiaDay,
  formatSofiaTime,
  formatSofiaDateTime,
} from "@/lib/format";

/**
 * Tell the studio that a card deposit was actually paid.
 *
 * The other client paths (balance, on-site) notify the admins the moment the
 * booking is created; the card path deliberately does not — at that point the
 * client is only being sent to the bank, and nothing has moved. The money is
 * confirmed in `settleEcommPaymentForBooking`, which is where this belongs, so
 * an admin never hears about a payment the bank refused.
 *
 * Two channels, like `notifyAdminsNewBooking`: an in-app Notification row per
 * admin (the schedule bell) and one email to all admin addresses. Both are
 * best-effort — a flaky mailer must never roll back a settled payment.
 *
 * The transaction identifiers are in the email on purpose: when the acquirer
 * asks about a `TrnID`, the studio can find it without opening the panel.
 */
export async function notifyAdminsCardPayment(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      user: { select: { fullName: true, email: true, phone: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          trainers: { orderBy: { name: "asc" }, select: { name: true } },
        },
      },
    },
  });
  if (!booking?.payment) {
    console.error("[notifyAdminsCardPayment] booking or payment not found", {
      bookingId,
    });
    return;
  }

  const cls = booking.scheduledClass;
  const payment = booking.payment;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const amountText = formatEurMinor(payment.amount);
  const who =
    booking.user.fullName ??
    booking.user.phone ??
    booking.user.email ??
    "Клиент";
  const message = `Платен депозит с карта: ${amountText} от ${who} за ${cls.practice.name} на ${dateText} в ${timeText} ч.`;

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
          // `new_booking` is the enum value the bell already knows; a paid card
          // deposit always arrives with the booking it guarantees.
          type: NotificationType.new_booking,
          scheduledClassId: cls.id,
          message,
        },
      });
    } catch (err) {
      console.error("[notifyAdminsCardPayment] in-app create failed", {
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

  const trainersText =
    cls.trainers.length > 0 ? cls.trainers.map((t) => t.name).join(" & ") : "—";
  const contact = booking.user.phone ?? booking.user.email ?? "—";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">${label}</td><td>${value}</td></tr>`;

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e">
      <h2 style="margin:0 0 12px;color:#c2158a">Платен депозит с карта</h2>
      <p style="font-size:14px;margin:0 0 12px">
        <strong>${amountText}</strong> · ${formatSofiaDateTime(payment.updatedAt)}
      </p>
      <table style="border-collapse:collapse;font-size:14px">
        ${row("Клиент", `<strong>${who}</strong>`)}
        ${row("Контакт", contact)}
        ${row("Тренировка", cls.practice.name)}
        ${row("Треньор", trainersText)}
        ${row("Дата", `${dateText} в ${timeText} ч.`)}
        ${row("Карта", payment.ecommCardMask ?? "—")}
        ${row("TrnID", payment.ecommTransId ?? "—")}
        ${row("RRN", payment.ecommRrn ?? "—")}
        ${row("Код на одобрение", payment.ecommApprovalCode ?? "—")}
      </table>
      <p style="font-size:12px;color:#6b476f;margin:14px 0 0">
        Депозитът е еднократна гаранция и остава по профила на клиента.
        Таксата за тренировката се плаща на място.
      </p>
    </div>`;

  await deliverEmail({
    to: recipients,
    subject: `Платен депозит ${amountText} — ${cls.practice.name} (${dateText}, ${timeText} ч.)`,
    html,
    tag: "notifyAdminsCardPayment",
  });
}
