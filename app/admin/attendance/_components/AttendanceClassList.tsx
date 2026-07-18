"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type AttendanceClassRow = {
  id: string;
  startAtISO: string;
  dayText: string;
  timeText: string;
  practiceName: string;
  trainersText: string;
  bookingsCount: number;
  unmarked: number;
  isUpcoming: boolean;
};

type SortBy = "date_desc" | "date_asc" | "unmarked";

const SORT_LABEL: Record<SortBy, string> = {
  date_desc: "Дата: нови → стари",
  date_asc: "Дата: стари → нови",
  unmarked: "Необработени най-отгоре",
};

export function AttendanceClassList({ rows }: { rows: AttendanceClassRow[] }) {
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sortBy === "date_asc") {
      list.sort((a, b) => a.startAtISO.localeCompare(b.startAtISO));
    } else if (sortBy === "unmarked") {
      // Most unfinished work first; ties broken by soonest date.
      list.sort(
        (a, b) =>
          b.unmarked - a.unmarked || a.startAtISO.localeCompare(b.startAtISO),
      );
    } else {
      list.sort((a, b) => b.startAtISO.localeCompare(a.startAtISO));
    }
    return list;
  }, [rows, sortBy]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
        <p className="font-display text-base font-semibold">Няма класове</p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
          Засега няма класове за обработка.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <label
          htmlFor="attendance-sort"
          className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/55"
        >
          Сортирай
        </label>
        <select
          id="attendance-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="flex-1 rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-wider text-[color:var(--brand-purple)] focus:border-[color:var(--brand-magenta)] focus:outline-none"
        >
          {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-2.5">
        {sorted.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/attendance/${c.id}`}
              className="block overflow-hidden rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-shadow hover:shadow-[0_1px_2px_rgba(123,45,142,0.06),0_8px_24px_-8px_rgba(236,72,153,0.28)]"
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                  {c.dayText}
                </span>
                <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                  {c.timeText}
                </span>
              </div>
              <h3 className="font-display text-[15px] font-semibold leading-tight">
                {c.practiceName}
              </h3>
              <p className="mt-1 truncate text-sm text-[color:var(--brand-purple)]/75">
                {c.trainersText}
              </p>
              <div className="mt-3 flex items-center justify-between text-[12px]">
                <span className="text-[color:var(--brand-purple)]/60">
                  {c.bookingsCount} записани
                </span>
                {c.isUpcoming ? (
                  <span className="inline-flex items-center rounded-full bg-[color:var(--brand-purple)]/15 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]">
                    Предстои
                  </span>
                ) : c.unmarked > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-[color:var(--brand-magenta)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
                    {c.unmarked} необработени
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Готово
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
