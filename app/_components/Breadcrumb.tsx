import Link from "next/link";

/**
 * Client-facing breadcrumb rendered under the logo on inner screens.
 * The logo itself links home, but clients don't know that — this makes the
 * way back explicit („Начало › График").
 */
export function Breadcrumb({ current }: { current: string }) {
  return (
    <nav
      aria-label="Навигация"
      className="mt-3 flex items-center justify-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider"
    >
      <Link
        href="/"
        className="text-[color:var(--brand-purple)]/60 transition-colors hover:text-[color:var(--brand-magenta)]"
      >
        Начало
      </Link>
      <span aria-hidden className="text-[color:var(--brand-purple)]/40">
        ›
      </span>
      <span aria-current="page" className="text-[color:var(--brand-magenta)]">
        {current}
      </span>
    </nav>
  );
}
