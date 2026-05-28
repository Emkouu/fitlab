"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingStatus, BookingSource } from "@/lib/generated/prisma/enums";
import { markAttendanceAction } from "../_actions";

export type AttendanceRow = {
  id: string;
  status: BookingStatus;
  source: BookingSource;
  who: string;
  cardPaid: boolean;
};

export function AttendancePanel({ rows }: { rows: AttendanceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
        <p className="font-display text-base font-semibold">Няма записани</p>
        <p className="mt-2 text-sm text-[color:var(--brand-purple)]/70">
          На този клас не е имало активни резервации.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <AttendanceItem key={r.id} row={r} />
      ))}
    </ul>
  );
}

function AttendanceItem({ row }: { row: AttendanceRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  function handle(outcome: "attended" | "no_show") {
    setErrMsg(null);
    startTransition(async () => {
      const r = await markAttendanceAction({ bookingId: row.id, outcome });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      router.refresh();
    });
  }

  const isMarked =
    row.status === BookingStatus.attended ||
    row.status === BookingStatus.no_show;

  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[color:var(--brand-ink)]">
            {row.who}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/55">
            {sourceLabel(row.source, row.cardPaid)}
          </p>
        </div>
        <StatusChip status={row.status} source={row.source} />
      </div>

      <MoneyNote status={row.status} source={row.source} cardPaid={row.cardPaid} />

      {!isMarked && (
        <div className="grid grid-cols-2 border-t border-[color:var(--brand-pink)]/30">
          <button
            type="button"
            disabled={pending}
            onClick={() => handle("attended")}
            className="flex min-h-12 items-center justify-center bg-[color:var(--brand-magenta)] px-4 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
          >
            {pending ? "…" : "Дойде"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => handle("no_show")}
            className="flex min-h-12 items-center justify-center border-l border-[color:var(--brand-pink)]/40 bg-white px-4 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
          >
            {pending ? "…" : "Не дойде"}
          </button>
        </div>
      )}

      {errMsg && (
        <p
          role="alert"
          className="border-t border-[color:var(--brand-pink)]/30 bg-[color:var(--brand-pink-soft)] px-4 py-2 text-[12px] text-[color:var(--brand-magenta)]"
        >
          {errMsg}
        </p>
      )}
    </li>
  );
}

function StatusChip({
  status,
  source,
}: {
  status: BookingStatus;
  source: BookingSource;
}) {
  if (status === BookingStatus.attended) {
    return (
      <span className="shrink-0 rounded-full bg-[color:var(--brand-magenta)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
        Дойде
      </span>
    );
  }
  if (status === BookingStatus.no_show) {
    return (
      <span className="shrink-0 rounded-full bg-[color:var(--brand-purple)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
        Не дойде
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
      Чака
    </span>
  );
  void source;
}

function MoneyNote({
  status,
  source,
  cardPaid,
}: {
  status: BookingStatus;
  source: BookingSource;
  cardPaid: boolean;
}) {
  // Source-aware money note. For no_show, surface the burn copy from the
  // Phase 2b spec ("депозитът е удържан" / "балансът е удържан" / "плащане
  // на място"). For other statuses, keep the original forward-looking copy
  // explaining what'll happen on verdict.
  if (status === BookingStatus.no_show) {
    const text =
      source === BookingSource.card
        ? "Депозитът е удържан."
        : source === BookingSource.balance
          ? "Балансът е удържан."
          : "Плащане на място.";
    return (
      <p className="mt-2 px-5 pb-3 text-[11px] leading-relaxed text-[color:var(--brand-magenta)]">
        {text}
      </p>
    );
  }

  const text =
    source === BookingSource.card
      ? cardPaid
        ? 'Депозит с карта · "Дойде" → връщане (предстои интеграция); "Не дойде" → удържан.'
        : "Депозит с карта, без потвърдено плащане."
      : source === BookingSource.balance
        ? 'Депозит от баланс · "Не дойде" → балансът е удържан.'
        : "Депозит на място — без онлайн действие.";
  return (
    <p className="mt-2 px-5 pb-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
      {text}
    </p>
  );
}

function sourceLabel(source: BookingSource, cardPaid: boolean): string {
  if (source === BookingSource.card) {
    return cardPaid ? "Карта · платено" : "Карта · чака плащане";
  }
  if (source === BookingSource.balance) {
    return "Баланс";
  }
  return "На място";
}
