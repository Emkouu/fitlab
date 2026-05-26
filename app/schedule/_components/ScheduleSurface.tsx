"use client";

import Image from "next/image";
import { useState } from "react";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { AgendaView, type DayBucket } from "./AgendaView";
import { WeekView } from "./WeekView";

type View = "list" | "week";

export function ScheduleSurface({
  agendaDays,
  weekDays,
  authChip,
}: {
  agendaDays: DayBucket[];
  weekDays: DayBucket[]; // exactly 7, Mon→Sun
  /** Server-rendered auth status chip (Вход / Профил). */
  authChip?: React.ReactNode;
}) {
  const [view, setView] = useState<View>("list");

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header className="mb-7">
        {/* Auth chip pinned top-right; logo stays centred. */}
        <div className="relative">
          <div className="flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="FitLab Varna"
              width={180}
              height={90}
              priority
              className="h-16 w-auto"
            />
          </div>
          {authChip && (
            <div className="absolute right-0 top-0">{authChip}</div>
          )}
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

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
      {view === "list" ? (
        <AgendaView days={agendaDays} />
      ) : (
        <WeekView days={weekDays} />
      )}
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
