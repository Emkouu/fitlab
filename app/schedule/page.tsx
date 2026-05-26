import Image from "next/image";
import { prisma } from "@/lib/db";
import {
  formatSofiaDay,
  formatSofiaTime,
  sofiaDateKey,
} from "@/lib/format";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { BookButton } from "@/app/schedule/_components/BookButton";

// Always read fresh from DB for now. (Tag-based caching in step 10 polish.)
export const dynamic = "force-dynamic";

/** Active booking statuses count against capacity (SPEC §4 / CLAUDE.md). */
const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
  BookingStatus.attended,
];

async function loadUpcoming() {
  return prisma.scheduledClass.findMany({
    where: { startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: {
      practice: true,
      trainers: { orderBy: { name: "asc" } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_STATUSES } } },
        },
      },
    },
    take: 200,
  });
}

type ClassRow = Awaited<ReturnType<typeof loadUpcoming>>[number];

function groupByDay(rows: ClassRow[]): { key: string; day: Date; rows: ClassRow[] }[] {
  const map = new Map<string, { key: string; day: Date; rows: ClassRow[] }>();
  for (const r of rows) {
    const key = sofiaDateKey(r.startAt);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, day: r.startAt, rows: [] };
      map.set(key, bucket);
    }
    bucket.rows.push(r);
  }
  return Array.from(map.values());
}

// "понеделник, 26.05.2026 г." → ["понеделник", "26.05.2026"]
function splitDay(formatted: string): { weekday: string; date: string } {
  const m = formatted.match(/^([^,]+),\s*(.+?)(?:\s*г\.?)?$/);
  if (!m) return { weekday: formatted, date: "" };
  return { weekday: m[1], date: m[2] };
}

export default async function SchedulePage() {
  const rows = await loadUpcoming();
  const days = groupByDay(rows);

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="FitLab Varna"
            width={180}
            height={90}
            priority
            className="h-16 w-auto"
          />
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      {/* ─── Page title ───────────────────────────────────────── */}
      <div className="mb-7 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          График
        </h1>
        <span className="text-xs text-[color:var(--brand-purple)]/60">
          {days.length > 0 ? `${days.length} дни напред` : ""}
        </span>
      </div>

      {/* ─── Days ─────────────────────────────────────────────── */}
      {days.length === 0 ? (
        <EmptyState />
      ) : (
        days.map(({ key, day, rows }) => {
          const { weekday, date } = splitDay(formatSofiaDay(day));
          return (
            <section key={key} className="mb-8 last:mb-0">
              <header className="mb-3 flex items-end gap-3">
                <span
                  aria-hidden
                  className="mb-1 h-4 w-1 rounded-full bg-[color:var(--brand-magenta)]"
                />
                <div>
                  <h2 className="font-display text-lg font-bold uppercase leading-none tracking-wide">
                    {weekday}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-[color:var(--brand-purple)]/60">
                    {date}
                  </p>
                </div>
              </header>
              <ul className="space-y-2.5">
                {rows.map((r) => (
                  <ClassCard key={r.id} row={r} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
      <p className="font-display text-base font-semibold">
        Няма предстоящи класове
      </p>
      <p className="mt-2 text-sm text-[color:var(--brand-purple)]/70">
        Скоро ще обявим новата програма.
      </p>
    </div>
  );
}

function ClassCard({ row }: { row: ClassRow }) {
  const remaining = row.capacity - row._count.bookings;
  const full = remaining <= 0;

  return (
    <li className="group overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-shadow hover:shadow-[0_1px_2px_rgba(123,45,142,0.06),0_8px_24px_-8px_rgba(236,72,153,0.28)]">
      {/* Content zone — heartbeat-echo bar lives here, doesn't run through the CTA */}
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-[color:var(--brand-magenta)] to-[color:var(--brand-pink)]"
        />

        <div className="flex items-start gap-4 px-5 pb-4 pt-4">
          {/* Time block */}
          <div className="shrink-0 pt-0.5">
            <div className="font-display text-2xl font-bold leading-none tracking-tight text-[color:var(--brand-magenta)]">
              {formatSofiaTime(row.startAt)}
            </div>
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/55">
              {row.durationMinutes} мин
            </div>
          </div>

          {/* Title + trainer */}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="font-display text-[15px] font-semibold leading-tight tracking-tight">
              {row.practice.name}
            </h3>
            <p className="mt-1 truncate text-sm text-[color:var(--brand-purple)]/75">
              {row.trainers.map((t) => t.name).join(" & ")}
            </p>
          </div>

          {/* Capacity pill */}
          <div className="shrink-0 pt-0.5">
            {full ? (
              <span className="inline-flex items-center rounded-full bg-[color:var(--brand-magenta)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
                Пълен
              </span>
            ) : (
              <span className="inline-flex items-baseline gap-1 rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--brand-purple)]">
                <span className="font-display font-bold text-[color:var(--brand-magenta)]">
                  {remaining}
                </span>
                <span className="text-[10px] uppercase tracking-wider">
                  места
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Special-event strip (still in content zone, above the CTA) */}
        {row.eventNotes && (
          <div className="flex items-stretch border-t border-[color:var(--brand-pink)]/40 bg-[color:var(--brand-pink-soft)]">
            <span
              aria-hidden
              className="w-[3px] shrink-0 bg-[color:var(--brand-magenta)]"
            />
            <p className="px-4 py-2.5 text-[12px] leading-snug text-[color:var(--brand-purple)]">
              {row.eventNotes}
            </p>
          </div>
        )}
      </div>

      {/* CTA — placeholder until steps 4–6 wire up the real booking flow */}
      {full ? (
        <div className="flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--brand-pink-soft)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]/70">
          Класът е пълен
        </div>
      ) : (
        <BookButton />
      )}
    </li>
  );
}
