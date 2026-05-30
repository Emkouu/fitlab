import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import { formatEurMinor } from "@/lib/format";
import { AdminActions } from "./_components/AdminActions";

export const metadata = { title: "FitLab Varna — Админ панел" };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminPage() {
  // ─── Role gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
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

  // ─── KPI: Total refundable balance (users' depositBalance) ───────────────
  const balanceResult = await prisma.user.aggregate({
    _sum: { depositBalance: true },
    where: {
      bookings: {
        some: { scheduledClass: { studioId } },
      },
    },
  });
  const totalRefundableBalance = balanceResult._sum.depositBalance || 0;

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
          href="/admin/clients"
          label="Баланс"
          value={formatEurMinor(totalRefundableBalance)}
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
      <AdminActions />
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
  return (
    <Link
      href={href}
      className="block rounded-2xl bg-white px-4 py-5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2"
    >
      <div className="text-xs text-[color:var(--brand-purple)]/60 uppercase tracking-wider">
        {label}
      </div>
      <div className={`mt-2 font-display text-3xl font-bold ${valueClass}`}>
        {value}
      </div>
    </Link>
  );
}
