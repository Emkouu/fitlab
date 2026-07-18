import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import {
  AttendanceClassList,
  type AttendanceClassRow,
} from "./_components/AttendanceClassList";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Присъствия" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const UNMARKED_STATUSES = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
];

export default async function AdminAttendanceIndexPage() {
  const admin = await getStaffUser();
  if (!admin) redirect("/schedule");

  const now = new Date();
  const pastCutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  // Show ALL non-cancelled classes — past (last 30d) and upcoming — so the
  // admin can mark attendance at any time. Newest first.
  const classes = await prisma.scheduledClass.findMany({
    where: {
      startAt: { gte: pastCutoff },
      cancelledAt: null,
    },
    include: {
      practice: { select: { name: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } },
        },
      },
    },
    orderBy: { startAt: "desc" },
    take: 120,
  });

  const byClass = await Promise.all(
    classes.map(async (c) => {
      const unmarked = await prisma.booking.count({
        where: { scheduledClassId: c.id, status: { in: UNMARKED_STATUSES } },
      });
      return { ...c, unmarked };
    }),
  );

  const rows: AttendanceClassRow[] = byClass.map((c) => ({
    id: c.id,
    startAtISO: c.startAt.toISOString(),
    dayText: formatSofiaDay(c.startAt),
    timeText: formatSofiaTime(c.startAt),
    practiceName: c.practice.name,
    trainersText: c.trainers.map((t) => t.name).join(" & ") || "—",
    bookingsCount: c._count.bookings,
    unmarked: c.unmarked,
    isUpcoming: c.startAt.getTime() > now.getTime(),
  }));

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-7">
        <div className="flex items-center justify-center">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Image
              src="/logo.png"
              alt="FitLab Varna"
              width={180}
              height={90}
              priority
              className="h-16 w-auto"
            />
          </Link>
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-5 mt-2 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Присъствия
        </h1>
      </div>

      <p className="mb-5 text-sm text-[color:var(--brand-purple)]/70">
        Всички класове — маркирай присъствия по всяко време.
      </p>

      <AttendanceClassList rows={rows} />
    </main>
  );
}
