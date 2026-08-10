"use client";

import { useState } from "react";
import { ScheduleList, type ScheduleListProps } from "./ScheduleList";
import { AdminScheduleCalendar } from "./AdminScheduleCalendar";

type View = "list" | "calendar";

export function AdminScheduleSurface({
  classes,
  studioDefaultDeposit,
  isSuperAdmin,
  readOnly = false,
}: ScheduleListProps & { isSuperAdmin: boolean; readOnly?: boolean }) {
  const [view, setView] = useState<View>("list");

  return (
    <>
      <div className="mb-5 flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Изглед на админ графика"
          className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
        >
          <ToggleButton selected={view === "list"} onClick={() => setView("list")}>
            Списък
          </ToggleButton>
          <ToggleButton selected={view === "calendar"} onClick={() => setView("calendar")}>
            Календар
          </ToggleButton>
        </div>
      </div>

      {view === "list" ? (
        <ScheduleList
          classes={classes}
          studioDefaultDeposit={studioDefaultDeposit}
          isSuperAdmin={isSuperAdmin}
          readOnly={readOnly}
        />
      ) : (
        <AdminScheduleCalendar
          classes={classes}
          studioDefaultDeposit={studioDefaultDeposit}
          readOnly={readOnly}
        />
      )}
    </>
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
      className={`min-h-10 rounded-full px-5 font-display text-[12px] font-bold uppercase tracking-wider transition-colors ${
        selected
          ? "bg-[color:var(--brand-magenta)] text-white shadow-[0_4px_12px_-6px_rgba(236,72,153,0.6)]"
          : "text-[color:var(--brand-purple)]/70 hover:text-[color:var(--brand-purple)]"
      }`}
    >
      {children}
    </button>
  );
}
