"use client";

import { useEffect, useState, useTransition } from "react";
import { sofiaDateKey } from "@/lib/format";
import { ClassCard, type ClassCardRow } from "./ClassCard";
import { getClassesForMonth } from "../_actions";

const MONTHS_BG = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const DAYS_BG = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"];

type Cell = { key: string; day: number; inMonth: boolean };

/**
 * Месец: month-grid calendar. Days that have at least one non-cancelled class
 * show a magenta dot; tapping a day reveals its class cards below the grid.
 * The current month renders synchronously from `initialMonth` data so first
 * paint has no spinner; month nav refetches via `getClassesForMonth`.
 */
export function MonthView({
  initialYear,
  initialMonth,
  initialData,
  onBook,
  onInfo,
  bookedClassIds,
  practiceFilter = null,
  windowEndKey,
}: {
  initialYear: number;
  initialMonth: number; // 0-indexed
  initialData: Record<string, ClassCardRow[]>;
  onBook: (row: ClassCardRow) => void;
  onInfo?: (row: ClassCardRow) => void;
  bookedClassIds?: Set<string>;
  /** When non-null, only show classes for this practiceId. Dots and the
   *  selected-day rows reflect the filter. */
  practiceFilter?: string | null;
  /** Last Sofia day ("YYYY-MM-DD") inside the public 7-day window. Days after
   *  it are inert — clients book at most a week ahead. */
  windowEndKey: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(initialData);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    const todayKey = sofiaDateKey(new Date());
    return initialData[todayKey] ? todayKey : null;
  });
  const [isPending, startTransition] = useTransition();

  // Re-fetch whenever (year, month) changes away from the initial pair.
  useEffect(() => {
    if (year === initialYear && month === initialMonth) return;
    startTransition(() => {
      getClassesForMonth(year, month).then((fresh) => {
        setData(fresh);
      });
    });
    setSelectedKey(null);
  }, [year, month, initialYear, initialMonth]);

  const cells = buildMonthGrid(year, month);
  const todayKey = sofiaDateKey(new Date());

  // Apply practice filter to both the dots map and the selected-day rows.
  const filteredData = practiceFilter
    ? Object.fromEntries(
        Object.entries(data).map(([k, rows]) => [
          k,
          rows.filter((r) => r.practiceId === practiceFilter),
        ]),
      )
    : data;
  const selectedRows = selectedKey ? filteredData[selectedKey] ?? [] : [];

  // The window never spans more than two calendar months, so there is nothing
  // to show past the month holding its last day.
  const windowEndMonth = Number(windowEndKey.slice(5, 7)) - 1;
  const windowEndYear = Number(windowEndKey.slice(0, 4));
  const canGoNext =
    year < windowEndYear || (year === windowEndYear && month < windowEndMonth);

  function prevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  }
  function nextMonth() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  }

  return (
    <div>
      <div
        className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {/* Header: prev / title / next */}
        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Предишен месец"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)]"
          >
            <Arrow direction="left" />
          </button>
          <h2 className="font-display text-base font-bold tracking-tight text-[color:var(--brand-ink)]">
            {MONTHS_BG[month]} {year}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            aria-label="Следващ месец"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Arrow direction="right" />
          </button>
        </header>

        {/* Day-of-week headers */}
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

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              isToday={cell.key === todayKey}
              isPast={cell.key < todayKey}
              isBeyondWindow={cell.key > windowEndKey}
              isSelected={cell.key === selectedKey}
              hasClasses={(filteredData[cell.key]?.length ?? 0) > 0}
              count={filteredData[cell.key]?.length ?? 0}
              onSelect={() => setSelectedKey(cell.key)}
            />
          ))}
        </div>
      </div>

      {/* Selected day classes */}
      {selectedKey && (
        <section className="mt-5">
          {selectedRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--brand-pink)]/60 bg-white/60 px-5 py-6 text-center text-sm text-[color:var(--brand-purple)]/65">
              Няма тренировки на този ден
            </div>
          ) : (
            <ul className="space-y-2.5">
              {selectedRows.map((r) => (
                <ClassCard
                  key={r.id}
                  row={r}
                  onBook={onBook}
                  onInfo={onInfo}
                  isBooked={bookedClassIds?.has(r.id) ?? false}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function DayCell({
  cell,
  isToday,
  isPast,
  isBeyondWindow,
  isSelected,
  hasClasses,
  count,
  onSelect,
}: {
  cell: Cell;
  isToday: boolean;
  isPast: boolean;
  isBeyondWindow: boolean;
  isSelected: boolean;
  hasClasses: boolean;
  count: number;
  onSelect: () => void;
}) {
  // Calendar is always "today onward, 7 days out": past days and days past the
  // public window are inert (not selectable) and show no class dots, so neither
  // previous classes nor next week's ever surface.
  const interactive = cell.inMonth && !isPast && !isBeyondWindow;
  const muted = !cell.inMonth || isPast || isBeyondWindow;

  return (
    <button
      type="button"
      onClick={interactive ? onSelect : undefined}
      disabled={!interactive}
      aria-label={`${cell.day}${hasClasses ? `, ${count} тренировки` : ""}`}
      aria-pressed={isSelected}
      className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${
        isSelected
          ? "bg-[color:var(--brand-pink-soft)]"
          : interactive
            ? "hover:bg-[color:var(--brand-pink-soft)]/60"
            : ""
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-[13px] font-semibold ${
          isToday
            ? "border-2 border-[color:var(--brand-magenta)] text-[color:var(--brand-magenta)]"
            : muted
              ? "text-[color:var(--brand-purple)]/35"
              : "text-[color:var(--brand-ink)]"
        }`}
      >
        {cell.day}
      </span>
      {hasClasses && interactive && (
        <span
          aria-hidden
          className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-magenta)]"
        />
      )}
    </button>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? <path d="M10 4l-4 4 4 4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
  );
}

/** 6×7 grid starting on the Monday on/before the 1st of the month. */
function buildMonthGrid(year: number, month: number): Cell[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = firstDay.getUTCDay(); // 0 = Sun
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
