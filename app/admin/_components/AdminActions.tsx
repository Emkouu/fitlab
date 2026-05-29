"use client";

import Link from "next/link";

const cardClass =
  "block rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]";

const groupLabelClass =
  "mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400";

type NavItem = { href: string; label: string };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "График",
    items: [
      { href: "/admin/schedule", label: "Виж графика" },
      { href: "/admin/schedule/new", label: "Добави клас" },
    ],
  },
  {
    label: "Хора",
    items: [
      { href: "/admin/clients", label: "Клиенти" },
      { href: "/admin/trainers", label: "Треньори" },
    ],
  },
  {
    label: "Дейности",
    items: [
      { href: "/admin/practices", label: "Практики" },
      { href: "/admin/attendance", label: "Присъствия" },
    ],
  },
  {
    label: "Настройки",
    items: [{ href: "/admin/settings", label: "Настройки" }],
  },
];

export function AdminActions() {
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label} className="mb-6">
          <div className={groupLabelClass}>{group.label}</div>
          <div className="space-y-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={cardClass}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
