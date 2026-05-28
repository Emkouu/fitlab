import Link from "next/link";

export type AdminBreadcrumbProps = {
  parentLabel: string;
  parentHref: string;
  currentLabel: string;
};

export function AdminBreadcrumb({
  parentLabel,
  parentHref,
  currentLabel,
}: AdminBreadcrumbProps) {
  return (
    <nav
      aria-label="Навигация назад"
      className="mb-3 flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70"
    >
      <Link
        href={parentHref}
        className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--brand-magenta)]"
      >
        <span aria-hidden>←</span>
        <span>{parentLabel}</span>
      </Link>
      <span aria-hidden className="text-[color:var(--brand-purple)]/40">
        /
      </span>
      <span className="truncate text-[color:var(--brand-purple)]/55">
        {currentLabel}
      </span>
    </nav>
  );
}
