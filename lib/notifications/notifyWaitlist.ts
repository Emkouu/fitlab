import { prisma } from "@/lib/db";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import { NotificationType } from "@/lib/generated/prisma/enums";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { sendSpotAvailableEmail } from "@/lib/email/sendSpotAvailableEmail";

const STUDIO_ADDRESS = "ул. Патриарх Евтимий 7а, Варна";

/**
 * Notify waitlisted users that a spot has opened up on a class.
 *
 * Idempotent in spirit: we only notify users whose `Waitlist.notifiedAt`
 * is still NULL, and we cap notifications at the number of remaining spots
 * so we never tell more people than can actually book. Safe to call after
 * any cancellation path (user, admin booking cancel, admin class cancel).
 */
export async function notifyWaitlist(scheduledClassId: string): Promise<void> {
  const cls = await prisma.scheduledClass.findUnique({
    where: { id: scheduledClassId },
    include: {
      practice: { select: { name: true } },
      studio: { select: { name: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
    },
  });

  if (!cls || cls.cancelledAt) return;

  const activeCount = await prisma.booking.count({
    where: {
      scheduledClassId,
      status: { in: ACTIVE_BOOKING_STATUSES },
    },
  });
  const remainingSpots = cls.capacity - activeCount;
  if (remainingSpots <= 0) return;

  const waiting = await prisma.waitlist.findMany({
    where: { scheduledClassId, notifiedAt: null },
    orderBy: { createdAt: "asc" },
    take: remainingSpots,
    include: { user: { select: { id: true, email: true, fullName: true } } },
  });

  if (waiting.length === 0) return;

  const dateText = formatSofiaDay(cls.startAt);
  const timeText = formatSofiaTime(cls.startAt);
  const trainersText =
    cls.trainers.length > 0 ? cls.trainers.map((t) => t.name).join(" & ") : "—";
  const message = `Освободи се място за ${cls.practice.name} на ${dateText} в ${timeText}!`;

  for (const entry of waiting) {
    try {
      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: entry.userId,
            type: NotificationType.spot_available,
            scheduledClassId,
            message,
          },
        }),
        prisma.waitlist.update({
          where: { id: entry.id },
          data: { notifiedAt: new Date() },
        }),
      ]);
    } catch (err) {
      console.error("[notifyWaitlist] failed to record notification", {
        waitlistId: entry.id,
        scheduledClassId,
        err,
      });
      continue;
    }

    if (entry.user.email) {
      await sendSpotAvailableEmail({
        to: entry.user.email,
        greetingName: entry.user.fullName,
        practiceName: cls.practice.name,
        dateText,
        timeText: `${timeText} ч.`,
        durationMinutes: cls.durationMinutes,
        trainersText,
        studioName: cls.studio.name,
        studioAddress: STUDIO_ADDRESS,
      });
    }
  }
}
