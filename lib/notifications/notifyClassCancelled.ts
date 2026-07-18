import { prisma } from "@/lib/db";
import { NotificationType } from "@/lib/generated/prisma/enums";
import { getResend } from "@/lib/email/resend";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";
const STUDIO_PHONE = "088 241 4863";
const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";

/**
 * Notify clients whose booking was cancelled because the studio cancelled the
 * class. Two channels: an in-app `class_cancelled` notification (schedule
 * bell) and an email. Best-effort — failures are logged, never thrown, so a
 * flaky mailer can't undo the already-committed cancellation/refunds.
 *
 * `affectedUserIds` are the users whose active bookings were just cancelled
 * (per the unique-active-booking index, at most one per user per class).
 */
export async function notifyClassCancelled(
  classId: string,
  affectedUserIds: string[],
): Promise<void> {
  const userIds = [...new Set(affectedUserIds)];
  if (userIds.length === 0) return;

  const cls = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      practice: { select: { name: true } },
      studio: { select: { name: true } },
    },
  });
  if (!cls) {
    console.error("[notifyClassCancelled] class not found", { classId });
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, fullName: true },
  });

  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const message = `Класът ${cls.practice.name} на ${dateText} в ${timeText} ч. е отменен. Ако си платил/а депозит, той е върнат.`;

  // ── Channel 1: in-app bell ──────────────────────────────────────────────
  for (const u of users) {
    try {
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: NotificationType.class_cancelled,
          scheduledClassId: classId,
          message,
        },
      });
    } catch (err) {
      console.error("[notifyClassCancelled] in-app create failed", {
        userId: u.id,
        classId,
        err,
      });
    }
  }

  // ── Channel 2: email ────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    console.warn("[notifyClassCancelled] RESEND_API_KEY not set; skipping email", {
      classId,
    });
    return;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  for (const u of users) {
    if (!u.email) continue;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e;max-width:480px">
        <h2 style="color:#c2158a;margin:0 0 12px">Класът е отменен</h2>
        <p style="font-size:14px;line-height:1.6">
          ${u.fullName ? `Здравей, ${u.fullName.split(" ")[0]}!<br/>` : ""}
          За съжаление класът <strong>${cls.practice.name}</strong> на
          <strong>${dateText} в ${timeText} ч.</strong> беше отменен.
        </p>
        <p style="font-size:14px;line-height:1.6">
          Ако си платил/а депозит, той вече е върнат. Разгледай другите
          свободни часове в графика.
        </p>
        <p style="margin:20px 0">
          <a href="${appUrl}/schedule"
             style="background:#c2158a;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
            Виж графика →
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="font-size:12px;color:#8a6d86;margin:4px 0">${cls.studio.name} · ${STUDIO_ADDRESS}</p>
        <p style="font-size:12px;color:#8a6d86;margin:4px 0">Тел: <a href="tel:${STUDIO_PHONE.replace(/\s+/g, "")}" style="color:#8a6d86">${STUDIO_PHONE}</a></p>
      </div>`;

    try {
      const result = await getResend().emails.send({
        from: FROM_ADDRESS,
        to: u.email,
        subject: `Отменен клас — ${cls.practice.name} (${dateText})`,
        html,
      });
      if (result.error) {
        console.error("[notifyClassCancelled] resend error", {
          userId: u.id,
          error: result.error,
        });
      }
    } catch (err) {
      console.error("[notifyClassCancelled] send threw", { userId: u.id, err });
    }
  }
}
