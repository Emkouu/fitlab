import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import {
  formatEurMinor,
  formatEurMinorCompact,
  formatSofiaDay,
  sofiaDateKey,
} from "@/lib/format";
import { dailyStats, type DayStats } from "@/lib/stats/turnover";
import {
  burnedDepositTotals,
  type BurnOriginKey,
} from "@/lib/stats/burnedDeposits";
import {
  receivedDepositTotals,
  type DepositEntryMethodKey,
} from "@/lib/stats/receivedDeposits";
import {
  currentMonthKey,
  formatMonthKeyBg,
  isMonthKey,
  sofiaMonthRange,
} from "@/lib/stats/monthRange";
import { depositAmountMinor } from "@/lib/deposit";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import { MonthNav } from "../_components/MonthNav";

export const metadata = { title: "FitLab Varna — Статистика" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Which key on the касов апарат a burned deposit has to be rung up on. */
const BURN_ORIGIN_ROWS: Array<{ key: BurnOriginKey; label: string }> = [
  { key: "cash", label: "Платен в брой" },
  { key: "card", label: "Платен с карта" },
  { key: "manual", label: "Ръчна корекция" },
  { key: "unknown", label: "Неизвестен произход" },
];

/** The order the desk thinks in: cash first, card second, corrections last. */
const METHOD_ROWS: Array<{ key: DepositEntryMethodKey; label: string }> = [
  { key: "cash", label: "В брой" },
  { key: "card", label: "С карта" },
  { key: "manual", label: "Ръчна корекция" },
];

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const { month } = searchParams ? await searchParams : {};
  const monthKey = isMonthKey(month) ? month : currentMonthKey();

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
      scheduledClass: {
        select: {
          startAt: true,
          depositAmount: true,
          studio: { select: { defaultDeposit: true } },
        },
      },
    },
  });

  // Burned deposits for the chosen Sofia month — money the studio kept because
  // the client no-showed or cancelled late. Grouped by the day of the class
  // that was missed, which is the day staff will remember.
  const monthRange = sofiaMonthRange(monthKey);
  const burnedRows = await prisma.booking.findMany({
    where: {
      depositBurnedMinor: { not: null },
      scheduledClass: {
        studioId: studio.id,
        startAt: { gte: monthRange.from, lt: monthRange.to },
      },
    },
    select: {
      depositBurnedMinor: true,
      depositBurnedMethod: true,
      depositFiscalizedAt: true,
      scheduledClass: { select: { startAt: true } },
    },
  });
  const burned = burnedDepositTotals(
    burnedRows.map((b) => ({
      depositBurnedMinor: b.depositBurnedMinor,
      classDayKey: sofiaDateKey(b.scheduledClass.startAt),
      method: (b.depositBurnedMethod ?? "unknown") as BurnOriginKey,
      fiscalized: b.depositFiscalizedAt !== null,
    })),
  );

  // The register queue is NOT a monthly figure: a burn from last month that was
  // never rung up must not fall off the bottom when the month rolls over. So it
  // is counted across all time and linked to its own view.
  const pendingBurns = await prisma.booking.aggregate({
    where: {
      depositBurnedMinor: { not: null },
      depositFiscalizedAt: null,
      scheduledClass: { studioId: studio.id },
    },
    _sum: { depositBurnedMinor: true },
    _count: true,
  });
  const pendingCount = pendingBurns._count;
  const pendingMinor = pendingBurns._sum.depositBurnedMinor ?? 0;

  // Deposits that reached the studio in the same month, however they were paid.
  // Read from the movements ledger and not from `User.depositBalance`: the
  // balance says what a client holds now, never that it arrived, so a deposit
  // paid in cash at the desk had no month to belong to and showed up nowhere.
  const depositEntries = await prisma.depositEntry.findMany({
    where: { createdAt: { gte: monthRange.from, lt: monthRange.to } },
    select: { amountMinor: true, method: true },
  });
  const received = receivedDepositTotals(
    depositEntries.map((e) => ({
      amountMinor: e.amountMinor,
      method: e.method as DepositEntryMethodKey,
    })),
  );

  const todayKey = sofiaDateKey(now);
  const days = dailyStats(
    rows.map((b) => ({
      status: b.status,
      source: b.source,
      depositMinor: depositAmountMinor(b.scheduledClass, b.scheduledClass.studio),
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
        <TotalCard label="Оборот" value={formatEurMinorCompact(totalTurnover)} accent />
        <TotalCard label="Записвания" value={String(totalBookings)} />
        <TotalCard label="Присъствали" value={String(totalAttended)} />
      </div>

      {/* The month block — deposits in, and deposits kept. Independent of the
          30-day view above, because this is the pair that closes a month. */}
      <MonthNav monthKey={monthKey} basePath="/admin/stats" />

      {/* Received deposits — cash at the desk counts exactly like card. */}
      <section className="mb-8">
        <h2 className="mb-1 font-display text-lg font-bold tracking-tight">
          Приети депозити
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
          Депозити, платени през {formatMonthKeyBg(monthKey)} — в брой на място
          или с карта през сайта.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <TotalCard
            label="Сума"
            value={formatEurMinorCompact(received.receivedMinor)}
            accent
          />
          <TotalCard label="Брой" value={String(received.receivedCount)} />
        </div>

        <ul className="mt-3 space-y-2">
          {METHOD_ROWS.map(({ key, label }) => {
            const m = received.receivedByMethod[key];
            if (m.count === 0) return null;
            return (
              <li
                key={key}
                className="flex items-baseline justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
              >
                <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                  {label}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                    {m.count} бр.
                  </span>
                  <span className="font-display text-base font-bold text-[color:var(--brand-purple)]">
                    {formatEurMinor(m.totalMinor)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {received.receivedCount === 0 && (
          <p className="mt-3 rounded-2xl bg-white px-4 py-5 text-center text-sm text-[color:var(--brand-purple)]/70 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
            През {formatMonthKeyBg(monthKey)} няма приети депозити.
          </p>
        )}

        {received.returnedCount > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
            Върнати през месеца: {formatEurMinor(received.returnedMinor)} (
            {received.returnedCount} бр.) — остават{" "}
            {formatEurMinor(received.netMinor)}.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
          Броят се движението на депозита, а не резервациите с него: депозитът е
          еднократна гаранция и стои по профила, докато не бъде усвоен или
          върнат. Депозити, записани преди тази справка да съществува, не могат
          да бъдат отнесени към месец и не се показват тук.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 font-display text-lg font-bold tracking-tight">
          Усвоени депозити
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
          Депозити, които остават за студиото — неявяване или отказ след срока.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <TotalCard label="Сума" value={formatEurMinorCompact(burned.totalMinor)} accent />
          <TotalCard label="Брой" value={String(burned.count)} />
        </div>

        {/* The register split — cash and card are different keys on the касов
            апарат, so the month's burns are shown the way they get rung up. */}
        {burned.count > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
            {BURN_ORIGIN_ROWS.map(({ key, label }) => {
              const g = burned.byOrigin[key];
              if (g.count === 0) return null;
              return (
                <li key={key} className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                    {label}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                      {g.count} бр.
                    </span>
                    <span className="font-display text-sm font-bold text-[color:var(--brand-purple)]">
                      {formatEurMinor(g.totalMinor)}
                    </span>
                  </span>
                </li>
              );
            })}
            <li className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[color:var(--brand-pink)] pt-1.5 text-[11px] text-[color:var(--brand-purple)]/60">
              <span>чукнати на касата</span>
              <span>
                {formatEurMinor(burned.fiscalized.totalMinor)} от{" "}
                {formatEurMinor(burned.totalMinor)}
              </span>
            </li>
          </ul>
        )}

        {pendingCount > 0 && (
          <Link
            href="/admin/stats/burned?pending=1"
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--brand-magenta)] px-4 py-3 text-white transition-opacity hover:opacity-90"
          >
            <span className="font-display text-xs font-bold uppercase tracking-wider">
              За касовия апарат
            </span>
            <span className="font-display text-sm font-bold">
              {pendingCount} бр. · {formatEurMinor(pendingMinor)} →
            </span>
          </Link>
        )}

        {burned.byDay.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white px-4 py-5 text-center text-sm text-[color:var(--brand-purple)]/70 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
            През {formatMonthKeyBg(monthKey)} няма усвоени депозити.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {burned.byDay.map((d) => (
                <li key={d.dayKey}>
                  {/* Each day opens the burns behind it — who, which class, and
                      why — because „колко" is never the whole question when a
                      client asks about their money. */}
                  <Link
                    href={`/admin/stats/burned?month=${monthKey}&day=${d.dayKey}`}
                    className="flex items-baseline justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                      {formatSofiaDay(new Date(`${d.dayKey}T12:00:00+03:00`))}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                        {d.count} бр.
                      </span>
                      <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
                        {formatEurMinor(d.totalMinor)}
                      </span>
                      <span aria-hidden className="text-[color:var(--brand-purple)]/40">
                        ›
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href={`/admin/stats/burned?month=${monthKey}`}
              className="mt-3 inline-flex font-display text-xs font-bold text-[color:var(--brand-magenta)]"
            >
              Виж всички усвоени депозити за месеца →
            </Link>
          </>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
          Усвоеният депозит е приход и се чука на касовия апарат — по начина, по
          който клиентът го е платил. Сумата е това, което реално е платил и е
          изгубил, записано на резервацията в момента на усвояването. Поправено
          „не дойде" връща депозита и той отпада от справката.
        </p>
      </section>

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
        className={`mt-1.5 font-display text-base font-bold tabular-nums leading-tight break-words ${
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
