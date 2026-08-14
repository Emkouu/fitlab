import Link from "next/link";
import {
  currentMonthKey,
  formatMonthKeyBg,
  shiftMonthKey,
} from "@/lib/stats/monthRange";

/**
 * ‹ август 2026 › — month stepper for the monthly reports.
 *
 * The month lives in `?month=YYYY-MM` rather than in component state so the
 * page stays a server component: every step is a fresh query against the real
 * numbers, and a link to „април" can be pasted into a message to an accountant.
 *
 * Stepping forward stops at the current month. There is nothing after it but
 * empty reports, and an empty report reads like a month with no money in it.
 */
export function MonthNav({
  monthKey,
  basePath,
}: {
  monthKey: string;
  basePath: string;
}) {
  const previous = shiftMonthKey(monthKey, -1);
  const next = shiftMonthKey(monthKey, 1);
  const atCurrent = monthKey >= currentMonthKey();

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <Link
        href={`${basePath}?month=${previous}`}
        aria-label={`Предишен месец: ${formatMonthKeyBg(previous)}`}
        className="rounded-lg px-2.5 py-1.5 font-display text-sm font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/60"
      >
        ‹
      </Link>

      <span className="font-display text-sm font-bold tracking-tight">
        {formatMonthKeyBg(monthKey)}
      </span>

      {atCurrent ? (
        <span
          aria-hidden="true"
          className="px-2.5 py-1.5 font-display text-sm font-bold text-[color:var(--brand-purple)]/25"
        >
          ›
        </span>
      ) : (
        <Link
          href={`${basePath}?month=${next}`}
          aria-label={`Следващ месец: ${formatMonthKeyBg(next)}`}
          className="rounded-lg px-2.5 py-1.5 font-display text-sm font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/60"
        >
          ›
        </Link>
      )}
    </div>
  );
}
