"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * A list that shows `step` items and reveals the next `step` on each tap.
 * The rows are rendered on the server; this only decides how many are visible.
 */
export function ShowMore({ children, step }: { children: ReactNode; step: number }) {
  const items = Children.toArray(children);
  const [visible, setVisible] = useState(step);
  const rest = items.length - visible;

  return (
    <>
      <ul className="space-y-2.5">{items.slice(0, visible)}</ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + step)}
          className="mt-3 w-full rounded-2xl border border-[color:var(--brand-pink)] bg-white px-4 py-3 font-display text-xs font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50"
        >
          Покажи още ({Math.min(step, rest)} от {rest})
        </button>
      )}
    </>
  );
}
