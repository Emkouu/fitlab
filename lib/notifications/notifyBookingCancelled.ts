import { prisma } from "@/lib/db";
import { Role, NotificationType } from "@/lib/generated/prisma/enums";
import { getResend } from "@/lib/email/resend";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";
const STUDIO_PHONE = "088 241 4863";
const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";

/**
 * Notify about a SINGLE booking cancellation (a client cancelling their own
 * spot, or an admin cancelling one booking) — as opposed to a whole class
 * being cancelled (see notifyClassCancelled).
 *
 * Channels:
 *   - Client: always. In-app `booking_cancelled` + email (confirms the cancel
 *     and whether the deposit was returned).
 *   - Admins: only when the CLIENT initiated (`byAdmin=false`) so staff learn
 *     about the freed spot. When an admin cancelled, they already know.
 *
 * Best-effort — every channel is wrapped so a flaky mailer or a missing email
 * can never undo the already-committed cancellation/refund.
 */
export async function notifyBookingCancelled(
  bookingId: string,
  opts: { byAdmin: boolean; depositReturned: boolean },
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          studio: { select: { name: true, phone: true } },
        },
      },
    },
  });
  if (!booking) {
    console.error("[notifyBookingCancelled] booking not found", { bookingId });
    return;
  }

  const cls = booking.scheduledClass;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const studioPhone = cls.studio.phone ?? STUDIO_PHONE;
  const who =
    booking.user.fullName ?? booking.user.phone ?? booking.user.email ?? "Клиент";
  const depositLine = opts.depositReturned
    ? "Депозитът е върнат."
    : "Депозитът е удържан.";

  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  /* ── Client: in-app bell ── */
  try {
    await prisma.notification.create({
      data: {
        userId: booking.user.id,
        type: NotificationType.booking_cancelled,
        scheduledClassId: cls.id,
        message: `Резервацията ти за ${cls.practice.name} на ${dateText} в ${timeText} ч. е отменена. ${depositLine}`,
      },
    });
  } catch (err) {
    console.error("[notifyBookingCancelled] client in-app failed", {
      bookingId,
      err,
    });
  }

  /* ── Client: email ── */
  if (hasResend && booking.user.email) {
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e;max-width:480px">
        <h2 style="color:#c2158a;margin:0 0 12px">Резервацията е отменена</h2>
        <p style="font-size:14px;line-height:1.6">
          ${booking.user.fullName ? `Здравей, ${booking.user.fullName.split(" ")[0]}!<br/>` : ""}
          Резервацията ти за <strong>${cls.practice.name}</strong> на
          <strong>${dateText} в ${timeText} ч.</strong> беше отменена.
        </p>
        <p style="font-size:14px;line-height:1.6"><strong>${depositLine}</strong></p>
        <p style="margin:20px 0">
          <a href="${appUrl}/schedule"
             style="background:#c2158a;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
            Виж графика →
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="font-size:12px;color:#8a6d86;margin:4px 0">${cls.studio.name} · ${STUDIO_ADDRESS}</p>
        <p style="font-size:12px;color:#8a6d86;margin:4px 0">Тел: <a href="tel:${studioPhone.replace(/\s+/g, "")}" style="color:#8a6d86">${studioPhone}</a></p>
      </div>`;
    try {
      const result = await getResend().emails.send({
        from: FROM_ADDRESS,
        to: booking.user.email,
        subject: `Отменена резервация — ${cls.practice.name} (${dateText})`,
        html,
      });
      if (result.error) {
        console.error("[notifyBookingCancelled] client resend error", {
          bookingId,
          error: result.error,
        });
      }
    } catch (err) {
      console.error("[notifyBookingCancelled] client send threw", {
        bookingId,
        err,
      });
    }
  }

  // Admins are only pinged when the client cancelled on their own.
  if (opts.byAdmin) return;

  const admins = await prisma.user.findMany({
    where: { role: { in: [Role.admin, Role.super_admin] } },
    select: { id: true, email: true },
  });
  if (admins.length === 0) return;

  const adminMsg = `${who} отмени резервация за ${cls.practice.name} на ${dateText} в ${timeText} ч. ${depositLine}`;

  /* ── Admins: in-app bell ── */
  for (const admin of admins) {
    try {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.booking_cancelled,
          scheduledClassId: cls.id,
          message: adminMsg,
        },
      });
    } catch (err) {
      console.error("[notifyBookingCancelled] admin in-app failed", {
        adminId: admin.id,
        bookingId,
        err,
      });
    }
  }

  /* ── Admins: email ── */
  const recipients = admins
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  if (!hasResend || recipients.length === 0) return;

  const contact = booking.user.phone ?? booking.user.email ?? "—";
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e">
      <h2 style="margin:0 0 12px;color:#c2158a">Клиент отмени резервация</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Клиент</td><td><strong>${who}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Контакт</td><td>${contact}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Тренировка</td><td>${cls.practice.name}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Дата</td><td>${dateText} в ${timeText} ч.</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Депозит</td><td>${depositLine}</td></tr>
      </table>
    </div>`;
  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `Отменена резервация — ${cls.practice.name} (${dateText}, ${timeText} ч.)`,
      html,
    });
    if (result.error) {
      console.error("[notifyBookingCancelled] admin resend error", {
        bookingId,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("[notifyBookingCancelled] admin send threw", { bookingId, err });
  }
}
