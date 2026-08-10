"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScheduledClass, Practice, Trainer } from "@/lib/generated/prisma/client";
import { sofiaDateKey, formatSofiaTime, formatEurMinor } from "@/lib/format";
import { depositAmountMinor } from "@/lib/deposit";

const MONTHS_BG = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const DAYS_BG = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"];

type Cell = { key: string; day: number; inMonth: boolean };

type AdminClass = ScheduledClass & {
  practice: Practice;
  trainers: Array<Pick<Trainer, "name" | "id">>;
  _count: { bookings: number };
};

/**
 * Admin month-view calendar. Counts active (non-cancelled) classes per day
 * and shows a "N класа" badge. Tapping a day reveals that day's class list
 * (cancelled rows render with strikethrough).
 */
export function AdminScheduleCalendar({
  classes,
  studioDefaultDeposit,
  readOnly = false,
}: {
  classes: AdminClass[];
  /** `Studio.defaultDeposit`, for classes that inherit rather than override. */
  studioDefaultDeposit: number;
  readOnly?: boolean;
}) {
  const initialKey = sofiaDateKey(new Date());
  const initialDate = new Date();
  const [year, setYear] = useState(Number(initialKey.slice(0, 4)));
  const [month, setMonth] = useState(initialDate.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);

  // Bucket all classes by Sofia date key. Cancelled classes still appear in
  // the day list (with strikethrough) but don't count toward the dot/badge.
  const byKey = new Map<string, AdminClass[]>();
  for (const c of classes) {
    const key = sofiaDateKey(c.startAt);
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const cells = buildMonthGrid(year, month);
  const todayKey = initialKey;
  const selectedClasses = selectedKey ? byKey.get(selectedKey) ?? [] : [];

  // The calendar starts from today onward: past days are disabled and the
  // „previous month" arrow is blocked once we're at the current month.
  const currentYear = Number(initialKey.slice(0, 4));
  const currentMonth = initialDate.getMonth();
  const atCurrentMonth = year === currentYear && month === currentMonth;

  function prevMonth() {
    if (atCurrentMonth) return; // don't navigate into the past
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }

  return (
    <div>
      <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            disabled={atCurrentMonth}
            aria-label="Предишен месец"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Arrow direction="left" />
          </button>
          <h2 className="font-display text-base font-bold tracking-tight">
            {MONTHS_BG[month]} {year}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Следващ месец"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-magenta)] hover:bg-[color:var(--brand-pink-soft)]"
          >
            <Arrow direction="right" />
          </button>
        </header>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {DAYS_BG.map((d) => (
            <div
              key={d}
              className="py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-[color:var(--brand-purple)]/55"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const dayClasses = byKey.get(cell.key) ?? [];
            const activeCount = dayClasses.filter((c) => !c.cancelledAt).length;
            return (
              <DayCell
                key={cell.key}
                cell={cell}
                isToday={cell.key === todayKey}
                isSelected={cell.key === selectedKey}
                isPast={cell.key < todayKey}
                count={activeCount}
                onSelect={() => setSelectedKey(cell.key)}
              />
            );
          })}
        </div>
      </div>

      {selectedKey && (
        <section className="mt-5">
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/80">
            {selectedKey}
          </h3>
          {selectedClasses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--brand-pink)]/60 bg-white/60 px-5 py-6 text-center text-sm text-[color:var(--brand-purple)]/65">
              Няма класове на този ден
            </div>
          ) : (
            <ul className="space-y-2.5">
              {selectedClasses.map((cls) => (
                <ClassRow
                  key={cls.id}
                  cls={cls}
                  studioDefaultDeposit={studioDefaultDeposit}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ClassRow({
  cls,
  studioDefaultDeposit,
  readOnly = false,
}: {
  cls: AdminClass;
  studioDefaultDeposit: number;
  readOnly?: boolean;
}) {
  const isCancelled = !!cls.cancelledAt;
  return (
    <li>
      <div
        className={`overflow-hidden rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] ${
          isCancelled ? "bg-[color:var(--brand-purple)]/5 opacity-60" : "bg-white"
        }`}
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span
            className={`font-display font-bold ${
              isCancelled
                ? "text-[color:var(--brand-magenta)]/40 line-through"
                : "text-[color:var(--brand-magenta)]"
            }`}
          >
            {formatSofiaTime(cls.startAt)}
          </span>
          {isCancelled && (
            <span className="inline-flex items-center rounded-full bg-[#512e63] px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
              Отказано
            </span>
          )}
        </div>
        <h3
          className={`font-display font-semibold leading-tight ${
            isCancelled ? "text-[color:var(--brand-purple)]/50 line-through" : ""
          }`}
        >
          {cls.practice.name}
        </h3>
        <div className="mt-2 space-y-0.5 text-xs text-[color:var(--brand-purple)]/75">
          <p>{cls.trainers.map((t) => t.name).join(" & ") || "—"}</p>
          <div className="flex items-center justify-between">
            <span>{cls.durationMinutes} мин</span>
            <span>
              {cls._count.bookings} / {cls.capacity} места
            </span>
          </div>
          <p>
            Депозит:{" "}
            {formatEurMinor(
              depositAmountMinor(cls, { defaultDeposit: studioDefaultDeposit }),
            )}
            {cls.depositAmount === null && (
              <span className="ml-1 text-[color:var(--brand-purple)]/45">
                (от настройките)
              </span>
            )}
          </p>
        </div>
        {!isCancelled && (
          <div className="mt-3 flex gap-2">
            <Link
              href={`/admin/attendance/${cls.id}`}
              className="flex-1 rounded-lg border border-[color:var(--brand-magenta)]/40 bg-[color:var(--brand-pink-soft)]/50 px-3 py-2 text-center text-xs font-semibold text-[color:var(--brand-magenta)] transition-all hover:bg-[color:var(--brand-pink-soft)]"
            >
              Записани ({cls._count.bookings}) →
            </Link>
            {!readOnly && (
              <Link
                href={`/admin/schedule/${cls.id}/edit`}
                className="flex-1 rounded-lg bg-[color:var(--brand-purple)] px-3 py-2 text-center text-xs font-semibold text-white transition-all hover:opacity-90"
              >
                Редактирай
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function DayCell({
  cell,
  isToday,
  isSelected,
  isPast,
  count,
  onSelect,
}: {
  cell: Cell;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  count: number;
  onSelect: () => void;
}) {
  // Only in-month days that aren't in the past are selectable.
  const interactive = cell.inMonth && !isPast;
  return (
    <button
      type="button"
      onClick={interactive ? onSelect : undefined}
      disabled={!interactive}
      aria-label={`${cell.day}${count > 0 ? `, ${count} класа` : ""}`}
      aria-pressed={isSelected}
      className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${
        isSelected
          ? "bg-[color:var(--brand-pink-soft)]"
          : interactive
            ? "hover:bg-[color:var(--brand-pink-soft)]/60"
            : ""
      } ${!interactive && cell.inMonth ? "cursor-not-allowed" : ""}`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-[13px] font-semibold ${
          isToday
            ? "ring-2 ring-[color:var(--brand-magenta)] text-[color:var(--brand-magenta)]"
            : !cell.inMonth || isPast
              ? "text-[color:var(--brand-purple)]/35"
              : "text-[color:var(--brand-ink)]"
        }`}
      >
        {cell.day}
      </span>
      {count > 0 && cell.inMonth && (
        <span className="absolute bottom-0.5 font-mono text-[9px] font-bold text-[color:var(--brand-magenta)]">
          {count} {count === 1 ? "клас" : "класа"}
        </span>
      )}
    </button>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? <path d="M10 4l-4 4 4 4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
  );
}

function buildMonthGrid(year: number, month: number): Cell[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = firstDay.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month, 1 - mondayOffset + i, 12));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    cells.push({
      key: `${yy}-${mm}-${dd}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
    });
  }
  return cells;
}
