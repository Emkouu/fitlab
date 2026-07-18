"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@/lib/generated/prisma/enums";
import { formatEurMinor } from "@/lib/format";

export type ClientRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  depositBalance: number;
  bookingsCount: number;
  createdAt: string;
};

type SortBy = "createdAt" | "name" | "balance";
type RoleFilter = "all" | "member" | "staff";

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super",
  admin: "Admin",
  coach: "Coach",
  member: "Член",
};

const ROLE_COLOR: Record<Role, string> = {
  super_admin: "bg-[color:var(--brand-magenta)] text-white",
  admin: "bg-[color:var(--brand-purple)] text-white",
  coach: "bg-[color:var(--brand-pink)] text-white",
  member: "bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-purple)]",
};

export function ClientList({
  rows,
  canOpenDetail = true,
}: {
  rows: ClientRow[];
  /** Coaches see the list but can't open the (admin-only) detail editor. */
  canOpenDetail?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;

    if (roleFilter === "member") {
      list = list.filter((r) => r.role === Role.member);
    } else if (roleFilter === "staff") {
      list = list.filter((r) => r.role !== Role.member);
    }

    if (needle) {
      list = list.filter((r) => {
        const name = (r.fullName ?? "").toLowerCase();
        const email = (r.email ?? "").toLowerCase();
        const phone = (r.phone ?? "").toLowerCase();
        return (
          name.includes(needle) ||
          email.includes(needle) ||
          phone.includes(needle)
        );
      });
    }

    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) =>
        (a.fullName ?? a.email ?? "").localeCompare(b.fullName ?? b.email ?? ""),
      );
    } else if (sortBy === "balance") {
      sorted.sort((a, b) => b.depositBalance - a.depositBalance);
    } else {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [rows, q, sortBy, roleFilter]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Търси по име, имейл или телефон…"
        className="mb-3 w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-4 py-3 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
      />

      <div className="mb-3 flex gap-2 text-[11px]">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="flex-1 rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 font-display font-semibold uppercase tracking-wider text-[color:var(--brand-purple)]"
        >
          <option value="all">Всички</option>
          <option value="member">Само членове</option>
          <option value="staff">Само staff</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="flex-1 rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 font-display font-semibold uppercase tracking-wider text-[color:var(--brand-purple)]"
        >
          <option value="createdAt">По дата</option>
          <option value="name">По име</option>
          <option value="balance">По баланс</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
          <p className="font-display text-base font-semibold">Няма резултати</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((r) => (
            <li key={r.id}>
              <CardShell id={r.id} canOpenDetail={canOpenDetail}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <p className="font-display text-[15px] font-semibold leading-tight">
                    {r.fullName ?? "—"}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${ROLE_COLOR[r.role]}`}
                  >
                    {ROLE_LABEL[r.role]}
                  </span>
                </div>
                <p className="truncate text-xs text-[color:var(--brand-purple)]/70">
                  {r.email ?? r.phone ?? "—"}
                </p>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="text-[color:var(--brand-purple)]/60">
                    {r.bookingsCount} записвания
                  </span>
                  <span
                    className={`font-display font-bold ${r.depositBalance > 0 ? "text-[color:var(--brand-magenta)]" : "text-[color:var(--brand-purple)]/40"}`}
                  >
                    {formatEurMinor(r.depositBalance)}
                  </span>
                </div>
              </CardShell>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Card wrapper: a Link into the detail editor for admins, a plain div for
 *  coaches (the detail page is admin-only). */
function CardShell({
  id,
  canOpenDetail,
  children,
}: {
  id: string;
  canOpenDetail: boolean;
  children: React.ReactNode;
}) {
  const className =
    "block overflow-hidden rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-shadow hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]";
  if (!canOpenDetail) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Link href={`/admin/clients/${id}`} className={className}>
      {children}
    </Link>
  );
}
