import { prisma } from "@/lib/db";
import { getResend } from "@/lib/email/resend";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";

/**
 * Email the trainer(s) of the booked class when a client reserves a spot.
 *
 * Only the trainers assigned to THAT specific class are notified — and only
 * those who have a linked login account with an email (Trainer → User). A
 * trainer never hears about bookings for classes they don't teach.
 *
 * Best-effort: failures are logged, never thrown, so a flaky mailer can't
 * roll back or fail the booking that already succeeded.
 */
export async function notifyTrainersNewBooking(bookingId: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[notifyTrainersNewBooking] RESEND_API_KEY not set; skipping", {
      bookingId,
    });
    return;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          trainers: {
            include: { user: { select: { email: true, fullName: true } } },
          },
        },
      },
    },
  });
  if (!booking) {
    console.error("[notifyTrainersNewBooking] booking not found", { bookingId });
    return;
  }

  const cls = booking.scheduledClass;
  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const who =
    booking.user.fullName ??
    booking.user.phone ??
    booking.user.email ??
    "Клиент";
  const contact = booking.user.phone ?? booking.user.email ?? "—";

  // Only trainers of THIS class who have a linked account email.
  const recipients = cls.trainers
    .map((t) => ({ email: t.user?.email ?? null, name: t.name }))
    .filter((t): t is { email: string; name: string } => Boolean(t.email));

  if (recipients.length === 0) return;

  for (const trainer of recipients) {
    const firstName = trainer.name.split(" ")[0];
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#2a0e2e;max-width:480px">
        <h2 style="margin:0 0 12px;color:#c2158a">Нова резервация за твоя час</h2>
        <p style="font-size:14px;line-height:1.6">Здравей, ${firstName}!</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Тренировка</td><td><strong>${cls.practice.name}</strong></td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Дата</td><td>${dateText} в ${timeText} ч.</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Клиент</td><td>${who}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#7b2d8e">Контакт</td><td>${contact}</td></tr>
        </table>
      </div>`;
    try {
      const result = await getResend().emails.send({
        from: FROM_ADDRESS,
        to: trainer.email,
        subject: `Нова резервация — ${cls.practice.name} (${dateText}, ${timeText} ч.)`,
        html,
      });
      if (result.error) {
        console.error("[notifyTrainersNewBooking] resend error", {
          bookingId,
          to: trainer.email,
          error: result.error,
        });
      }
    } catch (err) {
      console.error("[notifyTrainersNewBooking] send threw", {
        bookingId,
        to: trainer.email,
        err,
      });
    }
  }
}
