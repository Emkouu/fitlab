import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import { BookingStatus, DepositEntryKind, Role } from "@/lib/generated/prisma/enums";
import { formatEurMinorCompact, sofiaDateKey } from "@/lib/format";
import { dailyStats } from "@/lib/stats/turnover";
import { classPriceMinor } from "@/lib/pricing";
import { AdminActions } from "./_components/AdminActions";

export const metadata = { title: "FitLab Varna — Админ панел" };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminPage() {
  // ─── Role gate: admins get the full panel, coaches a reduced one ────────
  const admin = await getStaffUser();
  if (!admin) {
    redirect("/schedule");
  }
  const isCoach = admin.role === Role.coach;

  // Coaches: no KPIs (financial data) — just the reduced nav.
  if (isCoach) {
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
        </header>

        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Треньорски панел
          </h1>
          <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
            {admin.email}
          </p>
        </div>

        <AdminActions isCoach />
      </main>
    );
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(Date.now() + SEVEN_DAYS_MS);

  // ─── Look up studio by slug (not hardcoded ID) ─────────────────────────
  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
  });
  if (!studio) {
    throw new Error("Studio not found");
  }
  const studioId = studio.id;

  // ─── KPI: Upcoming classes (7 days) ──────────────────────────────────────
  const upcomingClasses = await prisma.scheduledClass.count({
    where: {
      studioId,
      startAt: { gte: now, lte: sevenDaysFromNow },
      cancelledAt: null,
    },
  });

  // ─── KPI: Total active bookings ──────────────────────────────────────────
  const activeBookings = await prisma.booking.count({
    where: {
      status: { in: ACTIVE_BOOKING_STATUSES },
      scheduledClass: { studioId },
    },
  });

  // ─── KPI: Today's turnover — deposits in today + class fees paid in cash ─
  // Same rule as Статистика (`lib/stats/turnover.ts`): a booking alone is not
  // money. Bounded query: today (Sofia) spans at most [now−26h, now+26h] in
  // UTC, so fetch that window and let the pure helper pick the Sofia day.
  const DAY_WINDOW_MS = 26 * 60 * 60 * 1000;
  const todayKey = sofiaDateKey(now);
  const windowFrom = new Date(Date.now() - DAY_WINDOW_MS);
  const windowTo = new Date(Date.now() + DAY_WINDOW_MS);
  const [todayBookings, todayDeposits] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: { not: BookingStatus.cancelled },
        scheduledClass: { studioId, startAt: { gte: windowFrom, lte: windowTo } },
      },
      select: {
        status: true,
        onsiteMethod: true,
        scheduledClass: {
          select: {
            startAt: true,
            practice: { select: { priceMinor: true } },
            studio: { select: { defaultClassPrice: true } },
          },
        },
      },
    }),
    prisma.depositEntry.findMany({
      where: {
        kind: { not: DepositEntryKind.correction },
        createdAt: { gte: windowFrom, lte: windowTo },
      },
      select: { amountMinor: true, createdAt: true },
    }),
  ]);
  const todayStats = dailyStats(
    todayBookings.map((b) => ({
      status: b.status,
      onsiteMethod: b.onsiteMethod,
      priceMinor: classPriceMinor(b.scheduledClass.practice, b.scheduledClass.studio),
      classStartAt: b.scheduledClass.startAt,
    })),
    todayDeposits,
  ).find((d) => d.dayKey === todayKey);
  const todayTurnover = todayStats?.turnoverMinor ?? 0;

  // ─── KPI: Cancelled classes (7 days) ────────────────────────────────────
  const cancelledClasses = await prisma.scheduledClass.count({
    where: {
      studioId,
      cancelledAt: {
        gte: new Date(Date.now() - SEVEN_DAYS_MS),
        lte: now,
      },
    },
  });

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
      </header>

      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Админ панел
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          {admin.email}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <StatCard
          href="/admin/schedule"
          label="Класове (7д)"
          value={upcomingClasses}
          valueClass="text-[color:var(--brand-magenta)]"
        />
        <StatCard
          href="/admin/clients"
          label="Записани"
          value={activeBookings}
          valueClass="text-[color:var(--brand-purple)]"
        />
        <StatCard
          href="/admin/stats"
          label="Дневен оборот"
          value={formatEurMinorCompact(todayTurnover)}
          valueClass="text-[color:var(--brand-pink)]"
        />
        <StatCard
          href="/admin/schedule"
          label="Отменени (7д)"
          value={cancelledClasses}
          valueClass="text-red-600"
        />
      </div>

      {/* Quick Actions */}
      <AdminActions isSuperAdmin={admin.role === "super_admin"} />
    </main>
  );
}

function StatCard({
  href,
  label,
  value,
  valueClass,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  valueClass: string;
}) {
  // A four-digit turnover („1 234 €") does not fit at text-3xl in a half-width
  // tile, so long values step down a size instead of spilling out of the card.
  const long = typeof value === "string" && value.length > 7;

  return (
    <Link
      href={href}
      className="block rounded-2xl bg-white px-4 py-5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2"
    >
      <div className="text-xs text-[color:var(--brand-purple)]/60 uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`mt-2 font-display font-bold tabular-nums leading-tight break-words ${
          long ? "text-2xl" : "text-3xl"
        } ${valueClass}`}
      >
        {value}
      </div>
    </Link>
  );
}
