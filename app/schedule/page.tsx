import { prisma } from "@/lib/db";
import { sofiaDateKey } from "@/lib/format";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { AuthChip } from "@/app/_components/AuthChip";
import { createClient } from "@/lib/supabase/server";
import { ScheduleSurface } from "./_components/ScheduleSurface";
import { getClassesForMonth } from "./_actions";
import type { DayBucket } from "./_components/AgendaView";
import type { ClassCardRow } from "./_components/ClassCard";

// Always read fresh from DB for now. (Tag-based caching is step 10 polish.)
export const dynamic = "force-dynamic";

/** Active booking statuses count against capacity (SPEC §4 / CLAUDE.md). */
const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
  BookingStatus.attended,
];

/**
 * Pulls every upcoming class for the Списък (agenda) view. The Месец view
 * fetches its own month-bounded data via `getClassesForMonth`.
 */
async function loadUpcoming(): Promise<ClassCardRow[]> {
  return prisma.scheduledClass.findMany({
    where: {
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    include: {
      practice: { select: { name: true, description: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      studio: { select: { name: true, cancelWindowHours: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_STATUSES } } },
        },
      },
    },
    take: 400,
  });
}

/** Agenda view: only days with at least one upcoming (startAt >= now) class. */
function agendaBuckets(rows: ClassCardRow[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const r of rows) {
    const start = typeof r.startAt === "string" ? new Date(r.startAt) : r.startAt;
    const key = sofiaDateKey(start);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, day: start, rows: [] };
      map.set(key, bucket);
    }
    bucket.rows.push(r);
  }
  return Array.from(map.values());
}

/** Sofia "now" → { year, month (0-indexed) } so the calendar opens on the
 *  user's actual current month, not the server's local TZ month. */
function currentSofiaMonth(): { year: number; month: number } {
  const key = sofiaDateKey(new Date()); // "YYYY-MM-DD"
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

export default async function SchedulePage() {
  const { year, month } = currentSofiaMonth();
  const [rows, supabase, monthData] = await Promise.all([
    loadUpcoming(),
    createClient(),
    getClassesForMonth(year, month),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's deposit balance + active upcoming bookings if authenticated
  let userBalance = 0;
  let bookedClassIds: string[] = [];
  let waitlistedClassIds: string[] = [];
  let unreadNotificationCount = 0;
  if (user) {
    const fitlabUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true, depositBalance: true },
    });
    userBalance = fitlabUser?.depositBalance ?? 0;

    if (fitlabUser) {
      const [bookings, waitlistRows, unread] = await Promise.all([
        prisma.booking.findMany({
          where: {
            userId: fitlabUser.id,
            status: { in: ACTIVE_STATUSES },
            scheduledClass: { startAt: { gte: new Date() } },
          },
          select: { scheduledClassId: true },
        }),
        prisma.waitlist.findMany({
          where: {
            userId: fitlabUser.id,
            scheduledClass: { startAt: { gte: new Date() }, cancelledAt: null },
          },
          select: { scheduledClassId: true },
        }),
        prisma.notification.count({
          where: { userId: fitlabUser.id, read: false },
        }),
      ]);
      bookedClassIds = bookings.map((b) => b.scheduledClassId);
      waitlistedClassIds = waitlistRows.map((w) => w.scheduledClassId);
      unreadNotificationCount = unread;
    }
  }

  return (
    <ScheduleSurface
      agendaDays={agendaBuckets(rows)}
      monthYear={year}
      monthIndex={month}
      monthData={monthData}
      authChip={<AuthChip />}
      isAuthed={!!user}
      userBalance={userBalance}
      bookedClassIds={bookedClassIds}
      waitlistedClassIds={waitlistedClassIds}
      unreadNotificationCount={unreadNotificationCount}
    />
  );
}
