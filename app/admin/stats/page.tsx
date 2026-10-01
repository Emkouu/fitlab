import Image from "next/image";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { BookingStatus, DepositEntryKind } from "@/lib/generated/prisma/enums";
import {
  formatEurMinor,
  formatEurMinorCompact,
  formatSofiaDay,
  sofiaDateKey,
} from "@/lib/format";
import { dailyStats, sumDays, type DayStats } from "@/lib/stats/turnover";
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
import { classPriceMinor } from "@/lib/pricing";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import { MonthNav } from "../_components/MonthNav";
import { ShowMore } from "./_components/ShowMore";

export const metadata = { title: "FitLab Varna — Статистика" };

/** Which key on the касов апарат a burned deposit has to be rung up on. */
const BURN_ORIGIN_ROWS: Array<{ key: BurnOriginKey; label: string }> = [
  { key: "cash", label: "В брой" },
  { key: "card", label: "С карта" },
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

  // The chosen Sofia month's bookings — for counts and for the class fees paid
  // in cash, which are the only class money the app sees.
  const now = new Date();
  const monthRange = sofiaMonthRange(monthKey);
  const rows = await prisma.booking.findMany({
    where: {
      status: { not: BookingStatus.cancelled },
      scheduledClass: {
        studioId: studio.id,
        startAt: { gte: monthRange.from, lt: monthRange.to },
      },
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
  });

  // Burned deposits for the chosen Sofia month — money the studio kept because
  // the client no-showed or cancelled late. Grouped by the day of the class
  // that was missed, which is the day staff will remember.
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

  // The register queue for the chosen month only — earlier months are history.
  const pendingCount = burned.pending.count;
  const pendingMinor = burned.pending.totalMinor;

  // Deposits that reached the studio in the same month, however they were paid.
  // Read from the movements ledger and not from `User.depositBalance`: the
  // balance says what a client holds now, never that it arrived, so a deposit
  // paid in cash at the desk had no month to belong to and showed up nowhere.
  const depositEntries = await prisma.depositEntry.findMany({
    where: { createdAt: { gte: monthRange.from, lt: monthRange.to } },
    select: { amountMinor: true, method: true, kind: true, createdAt: true },
  });
  const received = receivedDepositTotals(
    depositEntries.map((e) => ({
      amountMinor: e.amountMinor,
      method: e.method as DepositEntryMethodKey,
    })),
  );

  // Turnover = deposits in (minus deposits given back) + class fees in cash.
  // Manual corrections are bookkeeping, not money, and stay out.
  const todayKey = sofiaDateKey(now);
  const days = dailyStats(
    rows.map((b) => ({
      status: b.status,
      onsiteMethod: b.onsiteMethod,
      priceMinor: classPriceMinor(b.scheduledClass.practice, b.scheduledClass.studio),
      classStartAt: b.scheduledClass.startAt,
    })),
    depositEntries
      .filter((e) => e.kind !== DepositEntryKind.correction)
      .map((e) => ({ amountMinor: e.amountMinor, createdAt: e.createdAt })),
  ).filter((d) => d.dayKey <= todayKey);

  const total = sumDays(days);
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

      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Статистика
        </h1>
      </div>

      {/* Everything below follows this month. */}
      <MonthNav monthKey={monthKey} basePath="/admin/stats" />

      <div className="grid grid-cols-3 gap-3">
        <TotalCard label="Оборот" value={formatEurMinorCompact(total.turnoverMinor)} accent />
        <TotalCard label="Записвания" value={String(total.bookings)} />
        <TotalCard label="Присъствали" value={String(total.attended)} />
      </div>

      {/* What the turnover is made of, so the number can be checked. */}
      <ul className="mb-8 mt-3 space-y-1.5 rounded-2xl bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <li className="flex items-baseline justify-between gap-3">
          <span>Депозити (приети − върнати)</span>
          <span className="font-display font-bold">{formatEurMinor(total.depositsMinor)}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span>Тренировки в брой</span>
          <span className="font-display font-bold">{formatEurMinor(total.cashFeesMinor)}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3 border-t border-[color:var(--brand-pink)] pt-1.5 text-[11px] text-[color:var(--brand-purple)]/70">
          <span>Абонаментна карта · Multisport</span>
          <span>
            {total.subscription} бр. · {total.multisport} бр.
          </span>
        </li>
      </ul>

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

        {/* One card, in the order the desk works: the month's total, then only
            what still has to be rung up — per key, because cash and card are
            different keys on the касов апарат — then what already has been. */}
        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-sm font-bold">
              Общо за {formatMonthKeyBg(monthKey)}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-xl font-bold text-[color:var(--brand-magenta)]">
                {formatEurMinor(burned.totalMinor)}
              </span>
              <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                ({burned.count} бр.)
              </span>
            </span>
          </div>

          {burned.count > 0 && (
            <>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                За чукане на касата
              </p>
              {burned.pending.count === 0 ? (
                <p className="mt-1.5 text-sm text-[color:var(--brand-purple)]/70">
                  Всичко е чукнато ✓
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {BURN_ORIGIN_ROWS.map(({ key, label }) => {
                    const g = burned.pendingByOrigin[key];
                    if (g.count === 0) return null;
                    return (
                      <li key={key} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm">{label}</span>
                        <span className="font-display text-base font-bold">
                          {formatEurMinor(g.totalMinor)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[color:var(--brand-pink)] pt-2.5 text-sm text-[color:var(--brand-purple)]/70">
                <span>Вече чукнати</span>
                <span className="font-display font-bold">
                  {formatEurMinor(burned.fiscalized.totalMinor)}
                </span>
              </div>
            </>
          )}
        </div>

        {pendingCount > 0 && (
          <Link
            href={`/admin/stats/burned?month=${monthKey}&pending=1`}
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--brand-magenta)] px-4 py-3 text-white transition-opacity hover:opacity-90"
          >
            <span className="font-display text-xs font-bold uppercase tracking-wider">
              Списък за чукане
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

        {/* The month for the accountant — a plain download, not a navigation. */}
        <a
          href={`/admin/stats/burned/pdf?month=${monthKey}`}
          download
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--brand-pink)] bg-white px-4 py-3 font-display text-xs font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50"
        >
          <FileDown aria-hidden className="h-4 w-4" />
          Изтегли PDF за счетоводителя · {formatMonthKeyBg(monthKey)}
        </a>
        <a
          href={`/admin/stats/burned/pdf?month=${monthKey}&origin=card`}
          download
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--brand-pink)] bg-white px-4 py-2.5 font-display text-[11px] font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50"
        >
          <FileDown aria-hidden className="h-3.5 w-3.5" />
          PDF само с карта (по банка) · {burned.byOrigin.card.count} бр. ·{" "}
          {formatEurMinor(burned.byOrigin.card.totalMinor)}
        </a>

        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
          Усвоеният депозит е приход и се чука на касовия апарат — по начина, по
          който клиентът го е платил. Сумата е това, което реално е платил и е
          изгубил, записано на резервацията в момента на усвояването. Поправено
          „не дойде" връща депозита и той отпада от справката.
        </p>
      </section>

      {/* Per-day rows — newest first, a week at a time. */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold tracking-tight">
          По дни
        </h2>
        {days.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-5 text-center text-sm text-[color:var(--brand-purple)]/70 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
            През {formatMonthKeyBg(monthKey)} няма записвания.
          </p>
        ) : (
          <ShowMore step={7}>
            {days.map((d) => (
              <DayRow
                key={d.dayKey}
                day={d}
                isToday={d.dayKey === todayKey}
                maxTurnover={maxTurnover}
              />
            ))}
          </ShowMore>
        )}
      </section>

      <p className="mt-6 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        Оборотът е парите, които реално са влезли: приетите депозити (в брой и с
        карта, минус върнатите) плюс таксите за тренировки, платени в брой.
        Абонаментна карта и Multisport се броят, но не се остойностяват — тези
        пари не минават през системата. Самото записване не е пари.
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
  const barPct = Math.max(0, Math.round((day.turnoverMinor / maxTurnover) * 100));
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

      {day.turnoverMinor !== 0 && (
        <p className="mt-2 text-[11px] text-[color:var(--brand-purple)]/70">
          депозити {formatEurMinor(day.depositsMinor)} · в брой{" "}
          {formatEurMinor(day.cashFeesMinor)}
        </p>
      )}

      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-[color:var(--brand-purple)]/70">
        <span>{day.bookings} записвания</span>
        <span>{day.attended} присъствали</span>
        {day.noShows > 0 && (
          <span className="text-red-500">{day.noShows} неявили се</span>
        )}
      </div>
    </li>
  );
}
