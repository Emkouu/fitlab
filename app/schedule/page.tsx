import { prisma } from "@/lib/db";
import {
  dateFromKey,
  sofiaCurrentWeekDates,
  sofiaDateKey,
} from "@/lib/format";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { AuthChip } from "@/app/_components/AuthChip";
import { createClient } from "@/lib/supabase/server";
import { ScheduleSurface } from "./_components/ScheduleSurface";
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
 * Pulls every class from the start of the current Sofia week (or older — we
 * use a 10-day buffer to safely cover any TZ edge) onwards. The two views
 * filter from this single result set:
 *  - Списък only renders rows whose startAt >= now (still upcoming).
 *  - Седмица renders every row whose Sofia date falls in Mon..Sun of this
 *    week, including past classes so the user can see what already happened.
 */
async function loadRelevant(): Promise<ClassCardRow[]> {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  return prisma.scheduledClass.findMany({
    where: {
      startAt: { gte: tenDaysAgo },
    },
    orderBy: { startAt: "asc" },
    include: {
      practice: { select: { name: true } },
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
  const now = Date.now();
  const map = new Map<string, DayBucket>();
  for (const r of rows) {
    const start = typeof r.startAt === "string" ? new Date(r.startAt) : r.startAt;
    if (start.getTime() < now) continue; // upcoming-only
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

/**
 * Week view: exactly 7 buckets for Mon..Sun of the current Sofia week,
 * each filled with whatever rows land on that calendar date — including
 * already-past classes, which render dimmed and without a CTA so the
 * user can still see what was on. Empty days render an empty-state card.
 */
function weekBuckets(rows: ClassCardRow[]): DayBucket[] {
  const weekKeys = sofiaCurrentWeekDates();
  const inWeek = new Set(weekKeys);
  const byKey = new Map<string, ClassCardRow[]>();
  for (const r of rows) {
    const start = typeof r.startAt === "string" ? new Date(r.startAt) : r.startAt;
    const key = sofiaDateKey(start);
    if (!inWeek.has(key)) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
  }
  return weekKeys.map((key) => ({
    key,
    day: dateFromKey(key),
    rows: byKey.get(key) ?? [],
  }));
}

export default async function SchedulePage() {
  const [rows, supabase] = await Promise.all([loadRelevant(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's deposit balance + active upcoming bookings if authenticated
  let userBalance = 0;
  let bookedClassIds: string[] = [];
  if (user) {
    const fitlabUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true, depositBalance: true },
    });
    userBalance = fitlabUser?.depositBalance ?? 0;

    if (fitlabUser) {
      const bookings = await prisma.booking.findMany({
        where: {
          userId: fitlabUser.id,
          status: { in: ACTIVE_STATUSES },
          scheduledClass: { startAt: { gte: new Date() } },
        },
        select: { scheduledClassId: true },
      });
      bookedClassIds = bookings.map((b) => b.scheduledClassId);
    }
  }

  return (
    <ScheduleSurface
      agendaDays={agendaBuckets(rows)}
      weekDays={weekBuckets(rows)}
      authChip={<AuthChip />}
      isAuthed={!!user}
      userBalance={userBalance}
      bookedClassIds={bookedClassIds}
    />
  );
}
