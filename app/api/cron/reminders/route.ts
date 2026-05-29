import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendClassReminder, type ReminderType } from "@/lib/email/sendReminder";

// Vercel cron pings this every 15 minutes. We sweep a ±15min window around
// the 24h and 2h marks so each booking lands in exactly one sweep.
const WINDOW_MS = 15 * 60 * 1000;
const H24_MS = 24 * 60 * 60 * 1000;
const H2_MS = 2 * 60 * 60 * 1000;

const ACTIVE_STATUSES = ["booked", "pending_deposit", "paid"] as const;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function dueBookings(type: ReminderType) {
  const now = Date.now();
  const center = type === "24h" ? now + H24_MS : now + H2_MS;
  const gte = new Date(center - WINDOW_MS);
  const lte = new Date(center + WINDOW_MS);

  return prisma.booking.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      [type === "24h" ? "reminder24hSentAt" : "reminder2hSentAt"]: null,
      scheduledClass: {
        startAt: { gte, lte },
        cancelledAt: null,
      },
    },
    select: { id: true },
  });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const errors: Array<{ bookingId: string; type: ReminderType }> = [];
  let sent24h = 0;
  let sent2h = 0;

  for (const type of ["24h", "2h"] as const) {
    const due = await dueBookings(type);
    for (const { id } of due) {
      const { ok } = await sendClassReminder(id, type);
      if (!ok) {
        errors.push({ bookingId: id, type });
        continue;
      }
      await prisma.booking.update({
        where: { id },
        data:
          type === "24h"
            ? { reminder24hSentAt: new Date() }
            : { reminder2hSentAt: new Date() },
      });
      if (type === "24h") sent24h++;
      else sent2h++;
    }
  }

  return NextResponse.json({ sent24h, sent2h, errors });
}
