"use client";

import { useState } from "react";
import Link from "next/link";
import { ScheduledClass, Practice, Trainer } from "@/lib/generated/prisma/client";
import { formatSofiaDay, formatSofiaTime, formatEurMinor } from "@/lib/format";
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
};

export function ScheduleList({
  classes,
  isSuperAdmin,
}: ScheduleListProps & { isSuperAdmin: boolean }) {
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
                    <span>Депозит: {formatEurMinor(cls.depositAmount)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
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
