import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { classPriceMinor } from "@/lib/pricing";
import { CLASS_FEE_METHOD_LABEL } from "@/lib/payments/classFeeMethods";
import {
  currentMonthKey,
  formatMonthKeyBg,
  isMonthKey,
  sofiaMonthRange,
} from "@/lib/stats/monthRange";
import {
  classLedger,
  trainerLedger,
  trainerLedgerTotals,
  type ClassLedgerEntry,
} from "@/lib/stats/trainerLedger";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";
import { MonthNav } from "../../_components/MonthNav";

export const metadata = { title: "FitLab Varna — Отчет по инструктори" };

/**
 * Per-trainer month report — super_admin only.
 *
 * The class fee is settled in the room, so the only trace of it is what staff
 * tap in Attendance. This page puts a month of that next to each trainer:
 * classes taught, who turned up, and how the money was declared.
 *
 * Two columns are the point of the page. „Без начин" is an attended client
 * with no payment method recorded; „Неотчетени" is a booking on a class that
 * has already happened and was never resolved at all. Both are usually a
 * forgotten tap, and both are also what undeclared cash looks like, so they sit
 * in the open rather than folded into the attendance count.
 */
export default async function TrainerReportPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");
  // Staff pay data about their own colleagues — admins do not get to see this,
  // only the owner. Re-checked here on every request, never trusted from nav.
  if (admin.role !== "super_admin") redirect("/admin");

  const { month } = searchParams ? await searchParams : {};
  const monthKey = isMonthKey(month) ? month : currentMonthKey();
  const { from, to } = sofiaMonthRange(monthKey);

  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: { id: true, defaultClassPrice: true },
  });
  if (!studio) throw new Error("Studio not found");

  const classes = await prisma.scheduledClass.findMany({
    where: {
      studioId: studio.id,
      startAt: { gte: from, lt: to },
      cancelledAt: null,
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      practice: { select: { name: true, priceMinor: true } },
      trainers: { select: { id: true, name: true } },
      bookings: { select: { status: true, onsiteMethod: true } },
    },
  });

  const ledgerClasses = classes.map((c) => ({
    id: c.id,
    trainerIds: c.trainers.map((t) => t.id),
    priceMinor: classPriceMinor(c.practice, studio),
  }));
  const ledgerBookings = classes.flatMap((c) =>
    c.bookings.map((b) => ({
      classId: c.id,
      status: b.status,
      onsiteMethod: b.onsiteMethod,
    })),
  );

  const entries = trainerLedger({
    classes: ledgerClasses,
    bookings: ledgerBookings,
  }).sort((a, b) => b.cashMinor - a.cashMinor || b.attended - a.attended);
  const totals = trainerLedgerTotals(entries);

  const trainerNames = new Map<string, string>();
  for (const c of classes) {
    for (const t of c.trainers) trainerNames.set(t.id, t.name);
  }

  const perClass = new Map<string, ClassLedgerEntry>(
    classLedger({ classes: ledgerClasses, bookings: ledgerBookings }).map((e) => [
      e.classId,
      e,
    ]),
  );

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-7">
        <div className="flex items-center justify-center">
          <Link href="/" className="transition-opacity hover:opacity-80">
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
          Отчет по инструктори
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
          Тренировки, посещения и деклариран начин на плащане. Видимо само за
          супер админ.
        </p>
      </div>

      <MonthNav monthKey={monthKey} basePath="/admin/reports/trainers" />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <SummaryCard
          label="В брой (общо)"
          value={formatEurMinor(totals.cashMinor)}
          accent
        />
        <SummaryCard label="Посещения" value={String(totals.attended)} />
        <SummaryCard label="Без начин" value={String(totals.unrecorded)} warn={totals.unrecorded > 0} />
        <SummaryCard label="Неотчетени" value={String(totals.unmarked)} warn={totals.unmarked > 0} />
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
          <p className="font-display text-base font-semibold">Няма данни</p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
            През {formatMonthKeyBg(monthKey)} няма проведени тренировки с
            назначен инструктор.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => {
            const own = classes.filter((c) =>
              c.trainers.some((t) => t.id === e.trainerId),
            );
            return (
              <li
                key={e.trainerId}
                className="overflow-hidden rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-[15px] font-bold leading-tight">
                    {trainerNames.get(e.trainerId) ?? "—"}
                  </h2>
                  <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
                    {formatEurMinor(e.cashMinor)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--brand-purple)]/75">
                  <span>{e.classes} трен.</span>
                  <span>{e.attended} посещения</span>
                  <span>{e.noShows} неявили се</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--brand-purple)]/60">
                  <span>
                    {CLASS_FEE_METHOD_LABEL.cash}: {e.byMethod.cash}
                  </span>
                  <span>
                    {CLASS_FEE_METHOD_LABEL.subscription}: {e.byMethod.subscription}
                  </span>
                  <span>
                    {CLASS_FEE_METHOD_LABEL.multisport}: {e.byMethod.multisport}
                  </span>
                </div>

                {(e.unrecorded > 0 || e.unmarked > 0) && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                    {e.unrecorded > 0 && <>{e.unrecorded} присъствия без отбелязан начин на плащане. </>}
                    {e.unmarked > 0 && <>{e.unmarked} резервации по минали тренировки не са отчетени.</>}
                  </p>
                )}

                <details className="mt-3 border-t border-[color:var(--brand-purple)]/10 pt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-[color:var(--brand-purple)]">
                    Тренировки ({own.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {own.map((c) => {
                      const stats = perClass.get(c.id);
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/admin/attendance/${c.id}`}
                            className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50"
                          >
                            <span className="min-w-0 flex-1 truncate text-[color:var(--brand-purple)]/75">
                              {formatSofiaDay(c.startAt)} · {formatSofiaTime(c.startAt)}{" "}
                              · {c.practice.name}
                            </span>
                            <span className="shrink-0 text-[color:var(--brand-purple)]/60">
                              {stats?.attended ?? 0} пос.
                            </span>
                            <span className="shrink-0 font-display font-bold text-[color:var(--brand-magenta)]">
                              {formatEurMinor(stats?.cashMinor ?? 0)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        „В брой" е цената на тренировката по посещенията, отчетени като платени в
        брой — абонамент и Multisport се броят, но не се остойностяват, защото
        през ръцете не минават пари. Тренировка с двама инструктори влиза изцяло
        при всеки от тях, така че сборът по инструктори може да е по-голям от
        оборота на студиото. Отвори тренировка, за да видиш поименно кой е бил.
      </p>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white px-3 py-4 text-center shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display text-base font-bold ${
          warn
            ? "text-amber-600"
            : accent
              ? "text-[color:var(--brand-magenta)]"
              : "text-[color:var(--brand-purple)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
