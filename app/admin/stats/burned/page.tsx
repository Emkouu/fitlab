import Image from "next/image";
import Link from "next/link";
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
import { BURN_REASON_LABEL, burnReason } from "@/lib/stats/burnedDeposits";
import {
  currentMonthKey,
  formatMonthKeyBg,
  isMonthKey,
  sofiaMonthRange,
} from "@/lib/stats/monthRange";
import { STUDIO_SLUG } from "@/lib/studio";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Усвоени депозити" };

/** "2026-08-13" — the day keys the summary links with. */
function isDayKey(v: string | undefined): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Every burned deposit of a month, one row each.
 *
 * The summary on /admin/stats answers „колко" and nothing else, which is the
 * wrong shape for the question staff actually get asked: a client says the
 * studio kept their money and someone has to say which class that was and why.
 * So each day on the summary opens here, and here every burn names the client,
 * the class they missed, the reason, and the exact amount taken.
 *
 * The reason is read off the booking's own status: a no-show, or a cancel late
 * enough to burn (a timely one never does). Admin only — this is money.
 */
export default async function BurnedDepositsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; day?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

  const { month, day } = searchParams ? await searchParams : {};
  const monthKey = isMonthKey(month) ? month : currentMonthKey();
  const dayKey = isDayKey(day) ? day : null;
  const { from, to } = sofiaMonthRange(monthKey);

  const studio = await prisma.studio.findUnique({
    where: { slug: STUDIO_SLUG },
    select: { id: true },
  });
  if (!studio) throw new Error("Studio not found");

  const bookings = await prisma.booking.findMany({
    where: {
      depositBurnedMinor: { not: null },
      scheduledClass: {
        studioId: studio.id,
        startAt: { gte: from, lt: to },
      },
    },
    select: {
      id: true,
      status: true,
      source: true,
      cancelledAt: true,
      depositBurnedMinor: true,
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
  const rows = bookings
    .filter((b) => (b.depositBurnedMinor ?? 0) > 0)
    .map((b) => ({
      ...b,
      burnedMinor: b.depositBurnedMinor as number,
      dayKey: sofiaDateKey(b.scheduledClass.startAt),
    }))
    .filter((b) => (dayKey ? b.dayKey === dayKey : true));

  const totalMinor = rows.reduce((s, r) => s + r.burnedMinor, 0);

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
          {dayKey
            ? formatSofiaDay(new Date(`${dayKey}T12:00:00+03:00`))
            : formatMonthKeyBg(monthKey)}{" "}
          · {rows.length} бр. · {formatEurMinor(totalMinor)}
        </p>
      </div>

      {dayKey && (
        <Link
          href={`/admin/stats/burned?month=${monthKey}`}
          className="mb-4 inline-flex rounded-full bg-white px-3 py-1.5 font-display text-xs font-bold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05)]"
        >
          Виж целия месец
        </Link>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-[color:var(--brand-purple)]/70 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
          Няма усвоени депозити за този период.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const reason = burnReason(r.status);
            return (
              <li
                key={r.id}
                className="rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
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

                <Link
                  href={`/admin/attendance/${r.scheduledClass.id}`}
                  className="mt-2.5 inline-flex text-[11px] font-semibold text-[color:var(--brand-magenta)]"
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
        поправянето му на „дойде" връща същата сума и редът отпада оттук.
      </p>
    </main>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  card: "с карта",
  balance: "с депозит по профила",
  onsite_deposit: "депозит на място",
};

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
