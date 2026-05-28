"use client";

import Link from "next/link";

export function AdminActions() {
  return (
    <div className="space-y-2">
      <Link
        href="/admin/schedule/new"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Добави клас
      </Link>
      <div className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)]/40 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] cursor-not-allowed opacity-50">
        Треньори (Phase 2.3)
      </div>
    </div>
  );
}
