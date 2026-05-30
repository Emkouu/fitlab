"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { AgendaView, type DayBucket } from "./AgendaView";
import { WeekView } from "./WeekView";
import { BookingModal } from "./BookingModal";
import { PaymentBanner } from "./PaymentBanner";
import type { ClassCardRow } from "./ClassCard";

type View = "list" | "week";

export function ScheduleSurface({
  agendaDays,
  weekDays,
  authChip,
  isAuthed,
  userBalance = 0,
  bookedClassIds = [],
}: {
  agendaDays: DayBucket[];
  weekDays: DayBucket[]; // exactly 7, Mon→Sun
  /** Server-rendered auth status chip (Вход / Профил). */
  authChip?: React.ReactNode;
  /** Server-computed auth state. Drives the „Избор" branch: open modal
   *  if true, redirect to /login otherwise. */
  isAuthed: boolean;
  /** User's deposit balance in EUR cents. */
  userBalance?: number;
  /** Scheduled-class ids the logged-in user has an active booking for. */
  bookedClassIds?: string[];
}) {
  const bookedSet = new Set(bookedClassIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("list");
  const [openClass, setOpenClass] = useState<ClassCardRow | null>(null);

  /** Flat index for lookup by id (resume-after-login + future deep-links). */
  const rowsById = (() => {
    const m = new Map<string, ClassCardRow>();
    for (const d of agendaDays) for (const r of d.rows) m.set(r.id, r);
    for (const d of weekDays) for (const r of d.rows) m.set(r.id, r);
    return m;
  })();

  // Auto-open modal on ?openBooking=<id> (post-login resume).
  useEffect(() => {
    const id = searchParams.get("openBooking");
    if (!id || !isAuthed) return;
    const row = rowsById.get(id);
    if (!row) return;
    setOpenClass(row);
    // Drop the param so a manual refresh doesn't keep popping the modal.
    const params = new URLSearchParams(searchParams);
    params.delete("openBooking");
    const qs = params.toString();
    router.replace(`/schedule${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAuthed]);

  function handleBook(row: ClassCardRow) {
    if (!isAuthed) {
      const next = `/schedule?openBooking=${encodeURIComponent(row.id)}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setOpenClass(row);
  }

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)] md:max-w-6xl md:px-8 lg:px-12">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header className="mb-7">
        {/* Auth chip pinned top-right; logo stays centred. */}
        <div className="relative">
          <div className="flex items-center justify-center">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Image
                src="/logo.png"
                alt="FitLab Varna"
                width={180}
                height={90}
                priority
                className="h-16 w-auto"
              />
            </Link>
          </div>
          {authChip && (
            <div className="absolute right-0 top-0">{authChip}</div>
          )}
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      {/* ─── Payment banner (post-Stripe-Checkout landing) ─────── */}
      <PaymentBanner />

      {/* ─── Toggle ───────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-center">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {/* ─── Title row ────────────────────────────────────────── */}
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          График
        </h1>
        <span className="text-xs text-[color:var(--brand-purple)]/60">
          {view === "list"
            ? agendaDays.length > 0
              ? `${agendaDays.length} ${agendaDays.length === 1 ? "ден" : "дни"} напред`
              : ""
            : "Пон – Нед"}
        </span>
      </div>

      {/* ─── Active view ──────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AgendaView days={agendaDays} onBook={handleBook} bookedClassIds={bookedSet} />
          </motion.div>
        ) : (
          <motion.div
            key="week"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <WeekView days={weekDays} onBook={handleBook} bookedClassIds={bookedSet} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single global modal, controlled by openClass. */}
      <BookingModal row={openClass} onClose={() => setOpenClass(null)} userBalance={userBalance} />
    </main>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: View;
  onChange: (v: View) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Изглед на графика"
      className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
    >
      <ToggleButton selected={value === "list"} onClick={() => onChange("list")}>
        Списък
      </ToggleButton>
      <ToggleButton selected={value === "week"} onClick={() => onChange("week")}>
        Седмица
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full px-5 font-display text-[12px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 ${
        selected
          ? "bg-[color:var(--brand-magenta)] text-white shadow-[0_4px_12px_-6px_rgba(236,72,153,0.6)]"
          : "text-[color:var(--brand-purple)]/70 hover:text-[color:var(--brand-purple)]"
      }`}
    >
      {children}
    </button>
  );
}
