"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ScheduledClass, Practice, Trainer } from "@/lib/generated/prisma/client";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { deleteClassAction } from "../../_actions";

export type DeleteClassModalProps = {
  classId: string;
  class: ScheduledClass & {
    practice: Practice;
    trainers: Array<Pick<Trainer, "name" | "id">>;
    _count: {
      bookings: number;
    };
  };
  onClose: () => void;
};

/**
 * Confirm dialog for the super_admin „Изтрий" action. Unlike cancel (which
 * keeps the row as „Отказано"), delete removes the class from the schedule
 * entirely; the server action guards refunds and payment-record retention.
 */
export function DeleteClassModal({
  classId,
  class: cls,
  onClose,
}: DeleteClassModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = () => onClose();
    const onCloseEvt = () => onClose();
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onCloseEvt);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onCloseEvt);
    };
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteClassAction(classId);
      if (!result.ok) {
        setError(result.message);
      } else {
        dialogRef.current?.close();
        window.location.reload();
      }
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="delete-class-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[24rem] rounded-3xl border-none bg-white p-0 text-[color:var(--brand-ink)] shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] backdrop:bg-[rgba(42,14,46,0.55)] backdrop:backdrop-blur-sm"
    >
      <div className="font-sans px-6 py-6">
        <h2
          id="delete-class-title"
          className="font-display text-lg font-bold tracking-tight text-red-600"
        >
          Изтриване на класа?
        </h2>

        <div className="mt-4 rounded-2xl bg-[color:var(--brand-pink-soft)]/60 px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/70">
            {formatSofiaDay(cls.startAt)}
          </p>
          <p className="mt-1 font-display text-xl font-bold leading-tight text-[color:var(--brand-magenta)]">
            {formatSofiaTime(cls.startAt)}
          </p>
          <h3 className="mt-2 font-display text-base font-semibold leading-tight">
            {cls.practice.name}
          </h3>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
          Класът ще бъде <strong>премахнат окончателно</strong> от графика —
          няма да се вижда нито от клиентите, нито тук. Действието не може да
          бъде върнато.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl bg-[color:var(--brand-pink-soft)] px-4 py-3 text-[13px] text-[color:var(--brand-magenta)]"
          >
            {error}
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {isPending ? "Изтриване…" : "Изтрий окончателно"}
          </button>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={isPending}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-[color:var(--brand-purple)]/20 bg-white px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
          >
            Назад
          </button>
        </div>
      </div>
    </dialog>
  );
}
