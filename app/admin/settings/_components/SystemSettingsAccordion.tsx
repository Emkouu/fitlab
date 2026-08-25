import type { ReactNode } from "react";

/**
 * „Системни настройки" — collapsed by default, because these are the knobs
 * nobody touches on a normal day (mail transport today, whatever infrastructure
 * setting comes next). Everyday settings stay above, visible without a click.
 *
 * Plain <details>, the same pattern the trainer report uses: no JS, keyboard
 * and screen-reader behaviour for free.
 */
export function SystemSettingsAccordion({
  summaryNote,
  children,
}: {
  /** One line shown next to the title while collapsed, e.g. the active transport. */
  summaryNote?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-[color:var(--brand-purple)]/15 bg-white/60 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="block font-display text-base font-bold text-[color:var(--brand-purple)]">
            Системни настройки
          </span>
          {summaryNote && (
            <span className="mt-0.5 block text-xs text-[color:var(--brand-purple)]/60">
              {summaryNote}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-display text-lg font-bold text-[color:var(--brand-magenta)] transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>

      <div className="mt-5 border-t border-[color:var(--brand-purple)]/10 pt-5">
        {children}
      </div>
    </details>
  );
}
