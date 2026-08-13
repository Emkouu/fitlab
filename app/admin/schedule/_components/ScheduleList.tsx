"use client";

import { useState } from "react";
import Link from "next/link";
import { ScheduledClass, Practice, Trainer } from "@/lib/generated/prisma/client";
import {
  formatSofiaDay,
  formatSofiaTime,
  formatEurMinor,
  sofiaDateKey,
} from "@/lib/format";
import { isWithinPublicWindow } from "@/lib/schedule/publicWindow";
import { depositAmountMinor } from "@/lib/deposit";
import { CancelClassModal } from "./CancelClassModal";
import { DeleteClassModal } from "./DeleteClassModal";

export type ScheduleListProps = {
  classes: (ScheduledClass & {
    practice: Practice;
    trainers: Array<Pick<Trainer, "name" | "id">>;
    _count: {
      bookings: number;
    };
  })[];
  /** `Studio.defaultDeposit`, so a class with no override can show what it
   *  actually inherits instead of a blank. */
  studioDefaultDeposit: number;
};

/**
 * Copy a shareable link straight to one class's booking sheet, so staff can
 * send „ето тази тренировка" instead of dictating a date and a time.
 *
 * The link is the same `?openBooking=<id>` deep link /events already uses, and
 * it is resolved server-side — but only special events survive outside the
 * public 7-day window (`loadDeepLinkRow` in app/schedule/page.tsx). For a
 * regular class further out the page still opens, just without the sheet, so
 * say that up front rather than letting someone send a link that half-works.
 */
function CopyClassLink({
  classId,
  opensBookingModal,
}: {
  classId: string;
  opensBookingModal: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const label =
    state === "copied"
      ? "Линкът е копиран ✓"
      : state === "failed"
        ? "Копирането не стана — линкът е в адреса на класа"
        : "Копирай линк за записване";

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const url = `${window.location.origin}/schedule?openBooking=${encodeURIComponent(classId)}`;
          try {
            await navigator.clipboard.writeText(url);
            setState("copied");
          } catch {
            // Clipboard needs a secure context and permission; neither is
            // guaranteed on every device staff use.
            setState("failed");
          }
          setTimeout(() => setState("idle"), 2500);
        }}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-xs font-semibold transition-all ${
          state === "copied"
            ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
            : "border border-[color:var(--brand-purple)]/25 bg-white text-[color:var(--brand-purple)] hover:bg-[color:var(--brand-purple)]/5"
        }`}
      >
        {label}
      </button>
      {!opensBookingModal && (
        <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--brand-purple)]/60">
          Класът е извън 7-дневния прозорец, който клиентите виждат — линкът ще
          отвори графика, но не и прозореца за записване.
        </p>
      )}
    </div>
  );
}

export function ScheduleList({
  classes,
  studioDefaultDeposit,
  isSuperAdmin,
  readOnly = false,
}: ScheduleListProps & { isSuperAdmin: boolean; readOnly?: boolean }) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);

  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
        <p className="font-display text-base font-semibold">Няма класове</p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
          Всички класове са минали или отменени.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2.5">
        {classes.map((cls) => {
          const isCancelled = !!cls.cancelledAt;
          return (
            <li key={cls.id}>
              <div
                className={`overflow-hidden rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all ${
                  isCancelled
                    ? "bg-[color:var(--brand-purple)]/5 opacity-50"
                    : "bg-white hover:shadow-[0_1px_2px_rgba(123,45,142,0.06),0_8px_24px_-8px_rgba(236,72,153,0.28)]"
                }`}
              >
                {/* Header: date, time, badge */}
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span
                    className={`font-mono text-[11px] uppercase tracking-wider ${
                      isCancelled
                        ? "text-[color:var(--brand-purple)]/40"
                        : "text-[color:var(--brand-purple)]/60"
                    } ${isCancelled ? "line-through" : ""}`}
                  >
                    {formatSofiaDay(cls.startAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-display font-bold ${
                        isCancelled
                          ? "text-[color:var(--brand-magenta)]/40 line-through"
                          : "text-[color:var(--brand-magenta)]"
                      }`}
                    >
                      {formatSofiaTime(cls.startAt)}
                    </span>
                    {isCancelled && (
                      <span className="inline-flex items-center rounded-full bg-[#512e63] px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
                        Отказано
                      </span>
                    )}
                  </div>
                </div>

                {/* Practice name & duration */}
                <h3
                  className={`font-display font-semibold leading-tight ${
                    isCancelled
                      ? "text-[color:var(--brand-purple)]/50 line-through text-[14px]"
                      : "text-[15px]"
                  }`}
                >
                  {cls.practice.name}
                </h3>

                {/* Meta info: trainers, duration, capacity, active bookings, deposit */}
                <div className="mt-3 space-y-1 text-xs text-[color:var(--brand-purple)]/75">
                  <p>
                    {cls.trainers.map((t) => t.name).join(" & ") || "—"}
                  </p>
                  <div className="flex items-center justify-between">
                    <span>{cls.durationMinutes} мин</span>
                    <span>
                      {cls._count.bookings} / {cls.capacity} места
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      Депозит:{" "}
                      {formatEurMinor(
                        depositAmountMinor(cls, {
                          defaultDeposit: studioDefaultDeposit,
                        }),
                      )}
                      {cls.depositAmount === null && (
                        <span className="ml-1 text-[color:var(--brand-purple)]/45">
                          (от настройките)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* „Записани" — open the class's enrolled list + attendance
                    + add-client. Shown for everyone (incl. read-only coaches). */}
                {!isCancelled && (
                  <div className="mt-3 space-y-2">
                    <Link
                      href={`/admin/attendance/${cls.id}`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[color:var(--brand-magenta)]/40 bg-[color:var(--brand-pink-soft)]/50 px-3 py-2 text-center text-xs font-semibold text-[color:var(--brand-magenta)] transition-all hover:bg-[color:var(--brand-pink-soft)]"
                    >
                      Записани ({cls._count.bookings}) →
                    </Link>
                    <CopyClassLink
                      classId={cls.id}
                      opensBookingModal={
                        cls.isSpecialEvent ||
                        isWithinPublicWindow(sofiaDateKey(cls.startAt))
                      }
                    />
                  </div>
                )}

                {/* Management actions — not rendered for coaches (read-only). */}
                {!readOnly && (
                <div className="mt-2 flex gap-2">
                  {isCancelled ? (
                    <button
                      className="flex-1 rounded-lg bg-[color:var(--brand-purple)] px-3 py-2 text-xs font-semibold text-white opacity-50"
                      disabled
                    >
                      Редактирай
                    </button>
                  ) : (
                    <Link
                      href={`/admin/schedule/${cls.id}/edit`}
                      className="flex-1 rounded-lg bg-[color:var(--brand-purple)] px-3 py-2 text-center text-xs font-semibold text-white transition-all hover:opacity-90"
                    >
                      Редактирай
                    </Link>
                  )}
                  {/* Cancel class is a super_admin-only destructive op (mass refunds). */}
                  {isSuperAdmin && !isCancelled && (
                    <button
                      onClick={() => setSelectedClassId(cls.id)}
                      className="flex-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-100"
                    >
                      Отмяна
                    </button>
                  )}
                  {/* Delete removes the row entirely; enabled for cancelled
                      classes and for ones nobody has booked (server re-checks). */}
                  {isSuperAdmin && (isCancelled || cls._count.bookings === 0) && (
                    <button
                      onClick={() => setDeleteClassId(cls.id)}
                      className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-red-700"
                    >
                      Изтрий
                    </button>
                  )}
                </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Modals */}
      {selectedClassId && (
        <CancelClassModal
          classId={selectedClassId}
          class={classes.find((c) => c.id === selectedClassId)!}
          onClose={() => setSelectedClassId(null)}
        />
      )}
      {deleteClassId && (
        <DeleteClassModal
          classId={deleteClassId}
          class={classes.find((c) => c.id === deleteClassId)!}
          onClose={() => setDeleteClassId(null)}
        />
      )}
    </>
  );
}
