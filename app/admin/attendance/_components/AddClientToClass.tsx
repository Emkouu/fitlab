"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAddBookingToClassAction } from "@/app/admin/_actions";

export type ClientOption = {
  id: string;
  name: string;
  contact: string;
};

/**
 * „+" control on the per-class attendance page. Lets staff manually add an
 * existing client to this class (creates an on-site booking). Clients already
 * enrolled are filtered out.
 */
export function AddClientToClass({
  classId,
  clients,
  enrolledIds,
}: {
  classId: string;
  clients: ClientOption[];
  enrolledIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const enrolled = useMemo(() => new Set(enrolledIds), [enrolledIds]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const available = clients.filter((c) => !enrolled.has(c.id));
    if (!needle) return available.slice(0, 30);
    return available
      .filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.contact.toLowerCase().includes(needle),
      )
      .slice(0, 30);
  }, [clients, enrolled, q]);

  function add(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminAddBookingToClassAction({ classId, userId });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setQ("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        aria-label="Добави клиент към класа"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand-magenta)] font-display text-xl font-bold leading-none text-white shadow-[0_4px_12px_-6px_rgba(236,72,153,0.6)] transition-all hover:scale-105 hover:bg-[color:var(--brand-purple)]"
      >
        {open ? "×" : "+"}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-[color:var(--brand-pink)]/50 bg-white p-3 shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]">
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Търси клиент по име или телефон…"
            className="mb-2 w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2.5 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
          />

          {error && (
            <p
              role="alert"
              className="mb-2 rounded-lg bg-[color:var(--brand-pink-soft)] px-3 py-2 text-[12px] text-[color:var(--brand-magenta)]"
            >
              {error}
            </p>
          )}

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {results.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-[color:var(--brand-purple)]/60">
                Няма намерени клиенти
              </li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add(c.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--brand-pink-soft)]/60 disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--brand-ink)]">
                        {c.name}
                      </span>
                      <span className="block truncate text-[11px] text-[color:var(--brand-purple)]/60">
                        {c.contact}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]">
                      {pending ? "…" : "Добави"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <Link
            href="/admin/clients/new"
            className="mt-2 block rounded-xl border border-dashed border-[color:var(--brand-pink)]/60 px-3 py-2.5 text-center text-[12px] font-semibold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/40"
          >
            + Нов клиент
          </Link>
        </div>
      )}
    </div>
  );
}
