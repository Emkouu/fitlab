"use client";

import { useEffect, useRef } from "react";
import { formatSofiaDay, sofiaDateKey } from "@/lib/format";
import { ClassCard, type ClassCardRow } from "./ClassCard";
import type { DayBucket } from "./AgendaView";

/**
 * Седмица: the current Europe/Sofia calendar week, Monday → Sunday (always 7).
 * On mobile we can't show 7 columns side-by-side legibly, so the strip is
 * horizontally scroll-snapped — one full day per swipe — and starts auto-
 * centered on today (or Monday if today fell before the seed window).
 *
 * Past dates and days with no classes show a quiet empty state so the
 * weekly shape is preserved.
 *
 * Server filters startAt >= now, so today's column never shows past slots.
 */
export function WeekView({
  days,
  onBook,
  bookedClassIds,
}: {
  days: DayBucket[];
  onBook: (row: ClassCardRow) => void;
  bookedClassIds?: Set<string>;
}) {
  const todayKey = sofiaDateKey(new Date());
  const stripRef = useRef<HTMLDivElement>(null);

  // Land on today (or the first non-past column if today is outside the
  // current Sofia week — e.g. server clock skew) so the user doesn't have
  // to swipe past the days that already happened.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const target =
      strip.querySelector<HTMLElement>('[data-today="true"]') ??
      strip.querySelector<HTMLElement>('[data-past="false"]');
    if (target) {
      strip.scrollTo({ left: target.offsetLeft - 20, behavior: "instant" });
    }
  }, [days]);

  return (
    <div className="-mx-5">
      <p className="mb-2 px-5 text-center text-[11px] font-medium uppercase tracking-wider text-[color:var(--brand-purple)]/55">
        ← Плъзни през дните →
      </p>

      <div
        ref={stripRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="Седмичен график"
      >
        {days.map((bucket) => (
          <DayColumn
            key={bucket.key}
            bucket={bucket}
            isToday={bucket.key === todayKey}
            isPast={bucket.key < todayKey}
            onBook={onBook}
            bookedClassIds={bookedClassIds}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  bucket,
  isToday,
  isPast,
  onBook,
  bookedClassIds,
}: {
  bucket: DayBucket;
  isToday: boolean;
  isPast: boolean;
  onBook: (row: ClassCardRow) => void;
  bookedClassIds?: Set<string>;
}) {
  const d = typeof bucket.day === "string" ? new Date(bucket.day) : bucket.day;
  const { weekday, date } = splitDayShort(formatSofiaDay(d));
  const empty = bucket.rows.length === 0;

  return (
    <section
      className="flex w-[88%] shrink-0 snap-center flex-col first:ml-0 last:mr-1"
      aria-current={isToday ? "date" : undefined}
      data-today={isToday}
      data-past={isPast}
    >
      <header className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className={`h-4 w-1 shrink-0 rounded-full ${
            isToday
              ? "bg-[color:var(--brand-magenta)]"
              : isPast
                ? "bg-[color:var(--brand-purple)]/20"
                : "bg-[color:var(--brand-pink)]"
          }`}
        />
        <div className="min-w-0">
          <h2
            className={`font-display text-base font-bold uppercase leading-none tracking-wide ${
              isPast ? "text-[color:var(--brand-purple)]/45" : ""
            }`}
          >
            {weekday}
            {isToday && (
              <span className="ml-2 align-middle font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]">
                · днес
              </span>
            )}
          </h2>
          <p
            className={`mt-0.5 font-mono text-[11px] ${
              isPast
                ? "text-[color:var(--brand-purple)]/35"
                : "text-[color:var(--brand-purple)]/60"
            }`}
          >
            {date}
          </p>
        </div>
      </header>

      {empty ? (
        <EmptyDay isPast={isPast} />
      ) : (
        <ul className="space-y-2.5">
          {bucket.rows.map((r) => (
            <ClassCard
              key={r.id}
              row={r}
              compact
              onBook={onBook}
              isBooked={bookedClassIds?.has(r.id) ?? false}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyDay({ isPast }: { isPast: boolean }) {
  return (
    <div
      className={`flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed bg-white/60 px-4 py-6 text-center text-[12px] ${
        isPast
          ? "border-[color:var(--brand-purple)]/15 text-[color:var(--brand-purple)]/40"
          : "border-[color:var(--brand-pink)]/60 text-[color:var(--brand-purple)]/65"
      }`}
    >
      {isPast ? "Денят отмина" : "Няма класове"}
    </div>
  );
}

/** "понеделник, 27.05.2026 г." → ["понеделник", "27.05"] (year dropped, column-tight) */
function splitDayShort(formatted: string): { weekday: string; date: string } {
  const m = formatted.match(/^([^,]+),\s*(.+?)(?:\s*г\.?)?$/);
  if (!m) return { weekday: formatted, date: "" };
  const date = m[2].replace(/\.20\d\d$/, "");
  return { weekday: m[1], date };
}
