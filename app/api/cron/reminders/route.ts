import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendClassReminder, type ReminderType } from "@/lib/email/sendReminder";
import { sendDepositReminder } from "@/lib/email/sendDepositReminder";
import { sendTrainerClassReminder } from "@/lib/email/sendTrainerReminder";
import { PaymentStatus } from "@/lib/generated/prisma/enums";

// Vercel cron pings this every 15 minutes. We sweep a ±15min window around
// the 24h and 2h marks so each booking lands in exactly one sweep.
const WINDOW_MS = 15 * 60 * 1000;
const H24_MS = 24 * 60 * 60 * 1000;
const H2_MS = 2 * 60 * 60 * 1000;

const ACTIVE_STATUSES = ["booked", "pending_deposit", "paid"] as const;

/**
 * How long a card hold may sit unpaid before we nudge the client.
 *
 * Long enough that we are not emailing somebody who is still typing their card
 * number, short enough that the class is usually still ahead of them. The cron
 * runs every 15 minutes, so the actual delay is 30–45 minutes.
 */
const ABANDONED_DEPOSIT_AFTER_MS = 30 * 60 * 1000;

/**
 * Card holds whose deposit never arrived: reserved, no paid Payment, older than
 * the grace period, class still ahead, and not nudged before.
 *
 * `depositReminderSentAt` is the idempotency claim — one nudge per booking, no
 * matter how many times the cron sees it.
 */
async function abandonedDepositBookings() {
  return prisma.booking.findMany({
    where: {
      source: "card",
      status: "booked",
      depositReminderSentAt: null,
      createdAt: { lt: new Date(Date.now() - ABANDONED_DEPOSIT_AFTER_MS) },
      scheduledClass: {
        startAt: { gt: new Date() },
        cancelledAt: null,
      },
      OR: [
        { payment: null },
        { payment: { status: { not: PaymentStatus.paid } } },
      ],
    },
    select: { id: true },
  });
}

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

/**
 * Classes whose trainers are due a reminder — same ±15min window as the client
 * reminders, so a class lands in exactly one sweep per mark.
 *
 * Cancelled classes are skipped, and so are classes nobody is assigned to
 * teach. The claim is on the class (`trainerReminder*SentAt`) because the
 * reminder is about the class, not about any single booking.
 */
async function dueClasses(type: ReminderType) {
  const now = Date.now();
  const center = type === "24h" ? now + H24_MS : now + H2_MS;

  return prisma.scheduledClass.findMany({
    where: {
      startAt: {
        gte: new Date(center - WINDOW_MS),
        lte: new Date(center + WINDOW_MS),
      },
      cancelledAt: null,
      [type === "24h"
        ? "trainerReminder24hSentAt"
        : "trainerReminder2hSentAt"]: null,
      trainers: { some: {} },
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

  // Trainer reminders — one letter per trainer per class, with the roster. Its
  // own idempotency claim sits on the class, so a failure here can never
  // suppress a client reminder or vice versa.
  let sentTrainer = 0;
  const trainerErrors: Array<{ classId: string; type: ReminderType }> = [];
  for (const type of ["24h", "2h"] as const) {
    for (const { id } of await dueClasses(type)) {
      const { ok } = await sendTrainerClassReminder(id, type);
      if (!ok) {
        trainerErrors.push({ classId: id, type });
        continue;
      }
      await prisma.scheduledClass.update({
        where: { id },
        data:
          type === "24h"
            ? { trainerReminder24hSentAt: new Date() }
            : { trainerReminder2hSentAt: new Date() },
      });
      sentTrainer++;
    }
  }

  // Abandoned card deposits — a separate sweep with its own idempotency claim,
  // so a failure here can never suppress a class reminder or vice versa.
  let sentDeposit = 0;
  const depositErrors: string[] = [];
  for (const { id } of await abandonedDepositBookings()) {
    const { ok } = await sendDepositReminder(id);
    if (!ok) {
      depositErrors.push(id);
      continue;
    }
    await prisma.booking.update({
      where: { id },
      data: { depositReminderSentAt: new Date() },
    });
    sentDeposit++;
  }

  return NextResponse.json({
    sent24h,
    sent2h,
    sentTrainer,
    sentDeposit,
    errors,
    trainerErrors,
    depositErrors,
  });
}
