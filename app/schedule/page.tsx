import { prisma } from "@/lib/db";
import { sofiaDateKey } from "@/lib/format";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { AuthChip } from "@/app/_components/AuthChip";
import { createClient } from "@/lib/supabase/server";
import { ScheduleSurface, type PracticeOption } from "./_components/ScheduleSurface";
import { getClassesForMonth } from "./_actions";
import {
  publicWindowEndExclusive,
  publicWindowEndKey,
} from "@/lib/schedule/publicWindow";
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

/** Everything a schedule card needs — shared by the agenda query and the
 *  single-row deep-link lookup so both produce the same `ClassCardRow`. */
const CLASS_CARD_INCLUDE = {
  practice: { select: { name: true, description: true, priceMinor: true } },
  trainers: { orderBy: { name: "asc" }, select: { name: true } },
  studio: {
    select: {
      name: true,
      cancelWindowHours: true,
      cardPaymentsEnabled: true,
      defaultClassPrice: true,
    },
  },
  _count: {
    select: {
      bookings: { where: { status: { in: ACTIVE_STATUSES } } },
    },
  },
} as const;

/**
 * Pulls the upcoming classes inside the public 7-day window for the Списък
 * (agenda) view. The Месец view fetches its own month-bounded data via
 * `getClassesForMonth`, clamped to the same window.
 */
async function loadUpcoming(): Promise<ClassCardRow[]> {
  return prisma.scheduledClass.findMany({
    where: {
      startAt: { gte: new Date(), lt: publicWindowEndExclusive() },
    },
    orderBy: { startAt: "asc" },
    include: CLASS_CARD_INCLUDE,
    take: 400,
  });
}

/**
 * Resolves `?openBooking=<id>` server-side. Special events live outside the
 * 7-day window (they're promoted weeks ahead on /events), so the row backing a
 * deep link isn't necessarily in the agenda or month payload — fetch it
 * directly instead of silently swallowing the link.
 */
async function loadDeepLinkRow(id: string | undefined): Promise<ClassCardRow | null> {
  if (!id) return null;
  return prisma.scheduledClass.findFirst({
    where: {
      id,
      cancelledAt: null,
      startAt: { gte: new Date() },
      // Regular classes stay inside the window; only special events may be
      // deep-linked from further out.
      OR: [
        { isSpecialEvent: true },
        { startAt: { lt: publicWindowEndExclusive() } },
      ],
    },
    include: CLASS_CARD_INCLUDE,
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

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ openBooking?: string }>;
}) {
  const { year, month } = currentSofiaMonth();
  const { openBooking } = searchParams ? await searchParams : {};
  const [rows, supabase, monthData, practices, deepLinkRow] = await Promise.all([
    loadUpcoming(),
    createClient(),
    getClassesForMonth(year, month),
    prisma.practice.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }) as Promise<PracticeOption[]>,
    loadDeepLinkRow(openBooking),
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
      practices={practices}
      windowEndKey={publicWindowEndKey()}
      deepLinkRow={deepLinkRow}
    />
  );
}
