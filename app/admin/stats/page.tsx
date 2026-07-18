import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { formatEurMinor, formatSofiaDay, sofiaDateKey } from "@/lib/format";
import { dailyStats, type DayStats } from "@/lib/stats/turnover";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Статистика" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function AdminStatsPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: { id: true },
  });
  if (!studio) {
    throw new Error("Studio not found");
  }

  // Last 30 days incl. today (queried in UTC with a day of slack; the pure
  // helper groups by Sofia-local class day).
  const now = new Date();
  const rows = await prisma.booking.findMany({
    where: {
      status: { not: BookingStatus.cancelled },
      scheduledClass: {
        studioId: studio.id,
        startAt: {
          gte: new Date(Date.now() - THIRTY_DAYS_MS - 26 * 60 * 60 * 1000),
          lte: now,
        },
      },
    },
    select: {
      status: true,
      source: true,
      scheduledClass: { select: { startAt: true, depositAmount: true } },
    },
  });

  const todayKey = sofiaDateKey(now);
  const days = dailyStats(
    rows.map((b) => ({
      status: b.status,
      source: b.source,
      depositAmount: b.scheduledClass.depositAmount,
      classStartAt: b.scheduledClass.startAt,
    })),
  ).filter((d) => d.dayKey <= todayKey);

  const totalTurnover = days.reduce((s, d) => s + d.turnoverMinor, 0);
  const totalBookings = days.reduce((s, d) => s + d.bookings, 0);
  const totalAttended = days.reduce((s, d) => s + d.attended, 0);
  const maxTurnover = Math.max(1, ...days.map((d) => d.turnoverMinor));

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

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Статистика
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          Оборот по дни · последните 30 дни
        </p>
      </div>

      {/* Period totals */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <TotalCard label="Оборот" value={formatEurMinor(totalTurnover)} accent />
        <TotalCard label="Записвания" value={String(totalBookings)} />
        <TotalCard label="Присъствали" value={String(totalAttended)} />
      </div>

      {/* Per-day rows */}
      {days.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
          <p className="font-display text-base font-semibold">Няма данни</p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
            През последните 30 дни няма записвания.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {days.map((d) => (
            <DayRow
              key={d.dayKey}
              day={d}
              isToday={d.dayKey === todayKey}
              maxTurnover={maxTurnover}
            />
          ))}
        </ul>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        Оборотът включва получени депозити: платени с карта, използван баланс и
        депозити на място при отчетено присъствие/неявяване. Незавършени картови
        плащания и неплатени „на място" резервации не се броят.
      </p>
    </main>
  );
}

function TotalCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white px-3 py-4 text-center shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display text-base font-bold ${
          accent ? "text-[color:var(--brand-magenta)]" : "text-[color:var(--brand-purple)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DayRow({
  day,
  isToday,
  maxTurnover,
}: {
  day: DayStats;
  isToday: boolean;
  maxTurnover: number;
}) {
  const barPct = Math.round((day.turnoverMinor / maxTurnover) * 100);
  // "четвъртък, 16.07.2026" from the day key (noon avoids TZ edge cases).
  const label = formatSofiaDay(new Date(`${day.dayKey}T12:00:00+03:00`));

  return (
    <li className="rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          {label}
          {isToday && (
            <span className="ml-2 rounded-full bg-[color:var(--brand-magenta)] px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-white">
              днес
            </span>
          )}
        </span>
        <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
          {formatEurMinor(day.turnoverMinor)}
        </span>
      </div>

      {/* Relative turnover bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--brand-pink-soft)]">
        <div
          className="h-full rounded-full bg-[color:var(--brand-magenta)]/80"
          style={{ width: `${barPct}%` }}
        />
      </div>

      <div className="mt-2 flex gap-4 text-[11px] text-[color:var(--brand-purple)]/70">
        <span>{day.bookings} записвания</span>
        <span>{day.attended} присъствали</span>
        {day.noShows > 0 && (
          <span className="text-red-500">{day.noShows} неявили се</span>
        )}
      </div>
    </li>
  );
}
