"use client";

import { useState } from "react";
import { useTransition } from "react";
import { ScheduledClass, Practice, Trainer } from "@/lib/generated/prisma/client";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { cancelClassAction } from "../../_actions";

export type CancelClassModalProps = {
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

export function CancelClassModal({
  classId,
  class: cls,
  onClose,
}: CancelClassModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelClassAction(classId);
      if (!result.ok) {
        setError(result.message);
      } else {
        // Success: close modal and refresh page
        onClose();
        // Force a page reload to update the schedule list
        window.location.reload();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
      <dialog
        open
        className="w-full max-w-[360px] rounded-3xl bg-white px-6 py-8 shadow-2xl"
      >
        <h2 className="font-display text-lg font-bold">Отмяна на класа?</h2>

        <div className="mt-4 space-y-2 text-sm text-[color:var(--brand-purple)]/75">
          <p>
            <span className="font-semibold">Дата & час:</span>{" "}
            {formatSofiaDay(cls.startAt)} · {formatSofiaTime(cls.startAt)}
          </p>
          <p>
            <span className="font-semibold">Практика:</span> {cls.practice.name}
          </p>
          <p>
            <span className="font-semibold">Активни записвания:</span>{" "}
            {cls._count.bookings}
          </p>
          <p className="mt-4 text-xs italic text-[color:var(--brand-purple)]/60">
            Всички {cls._count.bookings} депозита ще бъдат върнати:
          </p>
          <ul className="ml-4 list-disc text-xs text-[color:var(--brand-purple)]/60">
            <li>Карта депозити → Stripe рефунд</li>
            <li>Баланс депозити → Профил баланс</li>
            <li>На място депозити → без действие</li>
          </ul>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5 disabled:opacity-50"
          >
            Отказ
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? "Отмяна..." : "Потвърди"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
