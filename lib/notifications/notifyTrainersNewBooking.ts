import { prisma } from "@/lib/db";
import { deliverEmail } from "@/lib/email/deliver";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";


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
    await deliverEmail({
      to: trainer.email,
      subject: `Нова резервация — ${cls.practice.name} (${dateText}, ${timeText} ч.)`,
      html,
      tag: "notifyTrainersNewBooking",
    });
  }
}
