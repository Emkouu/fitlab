import { prisma } from "@/lib/db";
import {
  dateFromKey,
  sofiaCurrentWeekDates,
  sofiaDateKey,
} from "@/lib/format";
import { BookingStatus } from "@/lib/generated/prisma/enums";
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

async function loadUpcoming(): Promise<ClassCardRow[]> {
  return prisma.scheduledClass.findMany({
    where: { startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: {
      practice: { select: { name: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_STATUSES } } },
        },
      },
    },
    take: 400,
  });
}

/** Agenda view: only days with at least one upcoming class. */
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

/**
 * Week view: exactly 7 buckets for Mon..Sun of the current Sofia week,
 * each filled with whatever rows land on that calendar date. Empty days
 * render an empty-state card so the grid keeps a constant 7-column shape.
 */
function weekBuckets(rows: ClassCardRow[]): DayBucket[] {
  const byKey = new Map<string, ClassCardRow[]>();
  for (const r of rows) {
    const start = typeof r.startAt === "string" ? new Date(r.startAt) : r.startAt;
    const key = sofiaDateKey(start);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
  }
  return sofiaCurrentWeekDates().map((key) => ({
    key,
    day: dateFromKey(key),
    rows: byKey.get(key) ?? [],
  }));
}

export default async function SchedulePage() {
  const rows = await loadUpcoming();
  return (
    <ScheduleSurface
      agendaDays={agendaBuckets(rows)}
      weekDays={weekBuckets(rows)}
    />
  );
}
