import Link from "next/link";

export type AdminBreadcrumbProps = {
  parentLabel: string;
  parentHref: string;
};

export function AdminBreadcrumb({
  parentLabel,
  parentHref,
}: AdminBreadcrumbProps) {
  return (
    <Link
      href={parentHref}
      aria-label={`Назад към ${parentLabel}`}
      className="mb-3 inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70 transition-colors hover:text-[color:var(--brand-magenta)]"
    >
      <span aria-hidden>←</span>
      <span>{parentLabel}</span>
    </Link>
  );
}
