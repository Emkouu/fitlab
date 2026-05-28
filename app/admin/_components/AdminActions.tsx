"use client";

import Link from "next/link";

export function AdminActions() {
  return (
    <>
      <Link
        href="/admin/attendance"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Присъствия
      </Link>
      <Link
        href="/admin/clients"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Клиенти
      </Link>
      <Link
        href="/admin/schedule/new"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Добави клас
      </Link>
      <Link
        href="/admin/trainers"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Треньори
      </Link>
      <Link
        href="/admin/practices"
        className="block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Практики
      </Link>
    </>
  );
}
