import { prisma } from "@/lib/db";
import { deliverEmail } from "@/lib/email/deliver";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import type { ReminderType } from "@/lib/email/sendReminder";

/** Same set as the client reminder: the statuses that hold a spot. */
const ACTIVE_STATUSES = ["booked", "pending_deposit", "paid"] as const;

/**
 * Remind the trainer(s) of a class that they are teaching it — 24h and 2h
 * before the start, the same marks the clients get.
 *
 * One letter per trainer per mark, carrying the roster: who is coming, how
 * many spots are left, and which of them still owe a deposit at the desk. Sent
 * even when nobody is enrolled — an empty class is exactly the thing a trainer
 * wants to know a day ahead.
 *
 * Only trainers with a linked login account and an email are reachable
 * (Trainer → User); a trainer never hears about classes they don't teach.
 * Idempotency lives on the class (`trainerReminder24hSentAt` /
 * `trainerReminder2hSentAt`), because the reminder is about the class, not
 * about any one booking.
 */
export async function sendTrainerClassReminder(
  scheduledClassId: string,
  type: ReminderType,
): Promise<{ ok: boolean }> {
  const cls = await prisma.scheduledClass.findUnique({
    where: { id: scheduledClassId },
    include: {
      practice: { select: { name: true } },
      studio: { select: { name: true, phone: true } },
      trainers: { include: { user: { select: { email: true } } } },
      bookings: {
        where: { status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          isFirstVisit: true,
          user: { select: { fullName: true, phone: true, email: true } },
        },
      },
    },
  });

  if (!cls) {
    console.error("[trainer-reminders] class not found", {
      scheduledClassId,
      type,
    });
    return { ok: false };
  }
  // Guard against a cancellation between the sweep and the send.
  if (cls.cancelledAt) {
    console.log("[trainer-reminders] skipping cancelled class", {
      scheduledClassId,
      type,
    });
    return { ok: false };
  }

  const recipients = cls.trainers
    .map((t) => ({ name: t.name, email: t.user?.email ?? null }))
    .filter((t): t is { name: string; email: string } => Boolean(t.email));

  if (recipients.length === 0) {
    // Nothing to send, and nothing to retry either — treat it as done so the
    // sweep stops looking at this class.
    return { ok: true };
  }

  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const enrolled = cls.bookings.length;
  const spotsLeft = Math.max(0, cls.capacity - enrolled);
  const subject =
    type === "24h"
      ? `Утре водиш ${cls.practice.name} в ${timeText} ч. — ${enrolled} записани`
      : `До 2 часа: ${cls.practice.name} в ${timeText} ч. — ${enrolled} записани`;

  const roster =
    enrolled === 0
      ? `<p style="font-size:14px;color:#6b476f;margin:0">Няма записани клиенти.</p>`
      : `<ol style="font-size:14px;line-height:1.7;margin:0;padding-left:20px">${cls.bookings
          .map((b) => {
            const who =
              b.user.fullName ?? b.user.phone ?? b.user.email ?? "Клиент";
            const notes = [
              b.status === "pending_deposit" ? "депозит на място" : null,
              b.isFirstVisit ? "първо посещение" : null,
            ].filter(Boolean);
            const suffix = notes.length
              ? ` <span style="color:#7b2d8e">· ${notes.join(" · ")}</span>`
              : "";
            return `<li>${who}${suffix}</li>`;
          })
          .join("")}</ol>`;

  let allOk = true;
  for (const trainer of recipients) {
    const firstName = trainer.name.split(" ")[0];
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e;max-width:480px">
        <h2 style="margin:0 0 12px;color:#c2158a">
          ${type === "24h" ? "Утре водиш час" : "Часът ти е след около 2 часа"}
        </h2>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Здравей, ${firstName}!</p>
        <table style="border-collapse:collapse;font-size:14px;margin:0 0 14px">
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Тренировка</td><td><strong>${cls.practice.name}</strong></td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Дата</td><td>${dateText} в ${timeText} ч.</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Времетраене</td><td>${cls.durationMinutes} мин.</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Студио</td><td>${cls.studio.name}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Записани</td><td><strong>${enrolled}</strong> от ${cls.capacity} · свободни ${spotsLeft}</td></tr>
        </table>
        <p style="font-size:13px;font-weight:600;color:#7b2d8e;margin:0 0 6px">Списък</p>
        ${roster}
      </div>`;

    const sent = await deliverEmail({
      to: trainer.email,
      subject,
      html,
      tag: "trainer-reminders",
    });
    if (!sent.ok) {
      allOk = false;
      console.error("[trainer-reminders] not sent", {
        scheduledClassId,
        type,
        to: trainer.email,
        error: sent.error,
      });
    }
  }

  return { ok: allOk };
}
