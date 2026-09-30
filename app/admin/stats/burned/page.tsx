import Image from "next/image";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import {
  formatEurMinor,
  formatSofiaDateTime,
  formatSofiaDay,
  formatSofiaTime,
  sofiaDateKey,
} from "@/lib/format";
import {
  BURN_REASON_LABEL,
  burnReason,
  type BurnOriginKey,
} from "@/lib/stats/burnedDeposits";
import {
  currentMonthKey,
  formatMonthKeyBg,
  isMonthKey,
  sofiaMonthRange,
} from "@/lib/stats/monthRange";
import { STUDIO_SLUG } from "@/lib/studio";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";
import { FiscalizeButton } from "../_components/FiscalizeButton";

export const metadata = { title: "FitLab Varna — Усвоени депозити" };

/** Which key on the касов апарат this money has to be rung up on. */
const ORIGIN_LABEL: Record<BurnOriginKey, string> = {
  cash: "В брой",
  card: "С карта",
  manual: "Ръчна корекция",
  unknown: "Неизвестен",
};

const SOURCE_LABEL: Record<string, string> = {
  card: "с карта",
  balance: "с депозит по профила",
  onsite_deposit: "депозит на място",
};

/** "2026-08-13" — the day keys the summary links with. */
function isDayKey(v: string | undefined): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Усвоени депозити — the work list for the касов апарат.
 *
 * A burned deposit is the moment a guarantee becomes income, and income goes
 * through the register: „в брой" and „с карта" are different keys there, so
 * each row carries the origin the client actually paid with
 * (`Booking.depositBurnedMethod`, snapshotted at burn time — the balance is one
 * pot and remembers nothing on its own).
 *
 * Ringing up is a physical act on the device. What this page adds is the record
 * that it happened, so the same €10 is never rung twice and nothing is missed
 * at month end. Three states: чака, чукнат, and — when a mis-tapped no_show was
 * corrected after the receipt was printed — чака сторно.
 *
 * `?pending=1` drops the month filter: the queue is not a monthly report, and a
 * burn from last month that was never rung up must not fall off the bottom.
 * Admin only — this is money.
 */
export default async function BurnedDepositsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; day?: string; pending?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

  const { month, day, pending } = searchParams ? await searchParams : {};
  const monthKey = isMonthKey(month) ? month : currentMonthKey();
  const dayKey = isDayKey(day) ? day : null;
  const pendingOnly = pending === "1";
  const { from, to } = sofiaMonthRange(monthKey);

  const studio = await prisma.studio.findUnique({
    where: { slug: STUDIO_SLUG },
    select: { id: true },
  });
  if (!studio) throw new Error("Studio not found");

  const bookings = await prisma.booking.findMany({
    where: {
      // Anything with money on it, or a receipt already printed for money that
      // has since been given back — both need staff attention.
      OR: [
        { depositBurnedMinor: { not: null } },
        { depositFiscalizedAt: { not: null } },
      ],
      scheduledClass: {
        studioId: studio.id,
        ...(pendingOnly ? {} : { startAt: { gte: from, lt: to } }),
      },
    },
    select: {
      id: true,
      status: true,
      source: true,
      cancelledAt: true,
      depositBurnedMinor: true,
      depositBurnedMethod: true,
      depositFiscalizedAt: true,
      depositFiscalizedMinor: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
      scheduledClass: {
        select: {
          id: true,
          startAt: true,
          practice: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduledClass: { startAt: "desc" } },
  });

  // A stored 0 is not a burn — the ledger writes what it actually consumed, and
  // a corrected no_show clears the column entirely.
  const all = bookings
    .map((b) => {
      const burnedMinor = b.depositBurnedMinor ?? 0;
      const fiscalized = b.depositFiscalizedAt !== null;
      return {
        ...b,
        burnedMinor,
        fiscalized,
        origin: (b.depositBurnedMethod ?? "unknown") as BurnOriginKey,
        dayKey: sofiaDateKey(b.scheduledClass.startAt),
        // Receipt printed, money since given back: the register needs a сторно.
        stornoNeeded: fiscalized && burnedMinor <= 0,
      };
    })
    .filter((b) => b.burnedMinor > 0 || b.stornoNeeded)
    .filter((b) => (dayKey ? b.dayKey === dayKey : true));

  const storno = all.filter((b) => b.stornoNeeded);
  const burns = all.filter((b) => !b.stornoNeeded);
  const queue = burns.filter((b) => !b.fiscalized);
  const done = burns.filter((b) => b.fiscalized);
  // The queue view drops a row the moment it is marked, which also drops its
  // „Свали отметката". Keep the last day's marks visible there, so a wrong tap
  // can be taken back from the same screen.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentlyDone = done.filter(
    (b) => b.depositFiscalizedAt && b.depositFiscalizedAt.getTime() > dayAgo,
  );
  const shown = pendingOnly ? [...queue, ...recentlyDone] : [...queue, ...done];

  // The register split: what is still waiting, per key.
  const queueByOrigin = queue.reduce<Record<BurnOriginKey, { totalMinor: number; count: number }>>(
    (acc, b) => {
      acc[b.origin].totalMinor += b.burnedMinor;
      acc[b.origin].count += 1;
      return acc;
    },
    {
      cash: { totalMinor: 0, count: 0 },
      card: { totalMinor: 0, count: 0 },
      manual: { totalMinor: 0, count: 0 },
      unknown: { totalMinor: 0, count: 0 },
    },
  );
  const queueTotal = queue.reduce((s, b) => s + b.burnedMinor, 0);
  const doneTotal = done.reduce((s, b) => s + b.burnedMinor, 0);

  const scopeLabel = pendingOnly
    ? "всички неотчетени"
    : dayKey
      ? formatSofiaDay(new Date(`${dayKey}T12:00:00+03:00`))
      : formatMonthKeyBg(monthKey);

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

      <AdminBreadcrumb
        parentLabel="Статистика"
        parentHref={`/admin/stats?month=${monthKey}`}
      />

      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Усвоени депозити
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          {scopeLabel} · {shown.length} бр.
        </p>
      </div>

      {/* За касовия апарат — the split that decides which key is pressed. */}
      <section className="mb-6 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <h2 className="font-display text-sm font-bold tracking-tight">
          За касовия апарат
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/70">
          Усвоеният депозит е приход и се чука на касата — по начина, по който
          клиентът първоначално го е платил.
        </p>

        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--brand-purple)]/70">
            Няма нечукнати усвоени депозити{pendingOnly ? "" : " за този период"}.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {(Object.keys(ORIGIN_LABEL) as BurnOriginKey[]).map((key) => {
              const g = queueByOrigin[key];
              if (g.count === 0) return null;
              return (
                <li key={key} className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                    {ORIGIN_LABEL[key]}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                      {g.count} бр.
                    </span>
                    <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
                      {formatEurMinor(g.totalMinor)}
                    </span>
                  </span>
                </li>
              );
            })}
            <li className="mt-2 flex items-baseline justify-between gap-3 border-t border-[color:var(--brand-pink)] pt-2">
              <span className="font-display text-xs font-bold uppercase tracking-wider">
                Общо за чукане
              </span>
              <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
                {formatEurMinor(queueTotal)}
              </span>
            </li>
          </ul>
        )}

        {done.length > 0 && (
          <p className="mt-3 text-[11px] text-[color:var(--brand-purple)]/55">
            Вече чукнати: {formatEurMinor(doneTotal)} ({done.length} бр.)
          </p>
        )}

        {queueByOrigin.unknown.count > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
            „Неизвестен произход" са депозити, записани преди справката да
            съществува — начинът на плащане не е записан никъде, така че сверете
            с клиентския профил, преди да ги чукнете.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {pendingOnly ? (
            <Link
              href={`/admin/stats/burned?month=${monthKey}`}
              className="rounded-full bg-[color:var(--brand-pink-soft)] px-3 py-1.5 font-display text-[11px] font-bold text-[color:var(--brand-purple)]"
            >
              Виж по месеци
            </Link>
          ) : (
            <Link
              href="/admin/stats/burned?pending=1"
              className="rounded-full bg-[color:var(--brand-pink-soft)] px-3 py-1.5 font-display text-[11px] font-bold text-[color:var(--brand-purple)]"
            >
              Всички нечукнати (всички месеци)
            </Link>
          )}
          {!pendingOnly && (
            <a
              href={`/admin/stats/burned/pdf?month=${monthKey}`}
              download
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-magenta)] px-3 py-1.5 font-display text-[11px] font-bold text-white"
            >
              <FileDown aria-hidden className="h-3.5 w-3.5" />
              PDF за {formatMonthKeyBg(monthKey)}
            </a>
          )}
          {dayKey && (
            <Link
              href={`/admin/stats/burned?month=${monthKey}`}
              className="rounded-full bg-[color:var(--brand-pink-soft)] px-3 py-1.5 font-display text-[11px] font-bold text-[color:var(--brand-purple)]"
            >
              Виж целия месец
            </Link>
          )}
        </div>
      </section>

      {/* Money given back after a receipt was printed. */}
      {storno.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 font-display text-lg font-bold tracking-tight">
            Чакат сторно ({storno.length})
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
            Чукнати на касата, но депозитът е върнат след това (поправено „не
            дойде"). Касовата бележка съществува — направете сторно и отбележете.
          </p>
          <ul className="space-y-2.5">
            {storno.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-red-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(123,45,142,0.05)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/admin/clients/${r.user.id}`}
                    className="font-display text-base font-bold tracking-tight underline decoration-[color:var(--brand-pink)] decoration-2 underline-offset-4"
                  >
                    {r.user.fullName ?? "Без име"}
                  </Link>
                  <span className="font-display text-base font-bold text-red-500">
                    −{formatEurMinor(r.depositFiscalizedMinor ?? 0)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--brand-purple)]/60">
                  {r.scheduledClass.practice.name} ·{" "}
                  {formatSofiaDay(r.scheduledClass.startAt)} · чукнат на{" "}
                  {r.depositFiscalizedAt
                    ? formatSofiaDateTime(r.depositFiscalizedAt)
                    : "—"}
                </p>
                <FiscalizeButton bookingId={r.id} fiscalized stornoNeeded />
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-[color:var(--brand-purple)]/70 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
          Няма усвоени депозити за този период.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => {
            const reason = burnReason(r.status);
            return (
              <li
                key={r.id}
                className={`rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] ${
                  r.fiscalized ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/admin/clients/${r.user.id}`}
                    className="font-display text-base font-bold tracking-tight underline decoration-[color:var(--brand-pink)] decoration-2 underline-offset-4"
                  >
                    {r.user.fullName ?? "Без име"}
                  </Link>
                  <span className="font-display text-base font-bold text-[color:var(--brand-magenta)]">
                    {formatEurMinor(r.burnedMinor)}
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-[color:var(--brand-purple)]/60">
                  {r.user.phone ?? r.user.email ?? "без контакт"}
                </p>

                <p className="mt-2 text-sm leading-snug">
                  {r.scheduledClass.practice.name}
                </p>
                <p className="text-[11px] text-[color:var(--brand-purple)]/60">
                  {formatSofiaDay(r.scheduledClass.startAt)} ·{" "}
                  {formatSofiaTime(r.scheduledClass.startAt)}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider ${
                      reason === "no_show"
                        ? "bg-red-50 text-red-600"
                        : "bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-purple)]"
                    }`}
                  >
                    {BURN_REASON_LABEL[reason]}
                  </span>
                  <span className="rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]">
                    каса: {ORIGIN_LABEL[r.origin]}
                  </span>
                  <span className="text-[11px] text-[color:var(--brand-purple)]/60">
                    записване: {SOURCE_LABEL[r.source] ?? r.source}
                  </span>
                </div>

                {r.cancelledAt && (
                  <p className="mt-2 text-[11px] text-[color:var(--brand-purple)]/60">
                    Отписан на {formatSofiaDateTime(r.cancelledAt)} —{" "}
                    {hoursBeforeLabel(r.cancelledAt, r.scheduledClass.startAt)}{" "}
                    преди началото.
                  </p>
                )}

                {r.fiscalized && r.depositFiscalizedAt && (
                  <p className="mt-2 text-[11px] font-semibold text-[color:var(--brand-purple)]/70">
                    ✓ Чукнат на касата на {formatSofiaDateTime(r.depositFiscalizedAt)}
                  </p>
                )}

                <FiscalizeButton bookingId={r.id} fiscalized={r.fiscalized} />

                <Link
                  href={`/admin/attendance/${r.scheduledClass.id}`}
                  className="mt-2.5 block text-[11px] font-semibold text-[color:var(--brand-magenta)]"
                >
                  Виж класа →
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        Сумата е точно това, което клиентът е държал по профила си в момента на
        усвояването — не текущата настройка. Ако „не дойде" е било грешка,
        поправянето му на „дойде" връща същата сума; ако депозитът вече е бил
        чукнат, редът минава в „Чакат сторно".
      </p>
    </main>
  );
}

/** „3 ч." / „25 мин." — how close to the class the cancel came. */
function hoursBeforeLabel(cancelledAt: Date, startAt: Date): string {
  const minutes = Math.max(
    0,
    Math.round((startAt.getTime() - cancelledAt.getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} мин.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч.` : `${hours} ч. ${rest} мин.`;
}
