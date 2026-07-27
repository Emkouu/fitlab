"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingStatus, BookingSource } from "@/lib/generated/prisma/enums";
import { adminAdjustClientDepositAction } from "@/app/admin/_actions";
import { markAttendanceAction, setOnsitePaymentAction } from "../_actions";

const ONSITE_METHODS = ["cash", "subscription", "multisport"] as const;
type OnsiteMethod = (typeof ONSITE_METHODS)[number];

const METHOD_LABEL: Record<OnsiteMethod, string> = {
  cash: "В брой",
  subscription: "Абонаментна карта",
  multisport: "Multisport",
};

export type AttendanceRow = {
  id: string;
  userId: string;
  status: BookingStatus;
  source: BookingSource;
  who: string;
  /** Whole prepaid deposits the client currently has available. */
  deposits: number;
  cardPaid: boolean;
  /** On-site payment method (cash | subscription | multisport) or null. */
  onsiteMethod: string | null;
  /** Whether staff marked the on-site deposit as settled ("Разплати"). */
  depositSettled: boolean;
};

export function AttendancePanel({
  rows,
  canManageDeposits = false,
}: {
  rows: AttendanceRow[];
  /** Admins only — coaches never see deposit controls. */
  canManageDeposits?: boolean;
}) {
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
        <AttendanceItem
          key={r.id}
          row={r}
          canManageDeposits={canManageDeposits}
        />
      ))}
    </ul>
  );
}

function AttendanceItem({
  row,
  canManageDeposits,
}: {
  row: AttendanceRow;
  canManageDeposits: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [deposits, setDeposits] = useState(row.deposits);
  const [method, setMethod] = useState<OnsiteMethod>(
    ONSITE_METHODS.includes(row.onsiteMethod as OnsiteMethod)
      ? (row.onsiteMethod as OnsiteMethod)
      : "cash",
  );
  const [settled, setSettled] = useState(row.depositSettled);
  // When a booking is already marked, staff can re-open the buttons to correct
  // an accidental "Дойде"/"Не дойде" (e.g. client actually did / didn't show).
  const [editing, setEditing] = useState(false);

  const isOnsite = row.source === BookingSource.onsite_deposit;

  function handle(outcome: "attended" | "no_show") {
    setErrMsg(null);
    startTransition(async () => {
      const r = await markAttendanceAction({ bookingId: row.id, outcome });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function persistPayment(nextMethod: OnsiteMethod, nextSettled: boolean) {
    setErrMsg(null);
    startTransition(async () => {
      const r = await setOnsitePaymentAction({
        bookingId: row.id,
        method: nextMethod,
        settled: nextSettled,
      });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      setSettled(nextSettled);
      router.refresh();
    });
  }

  function handleMethodChange(m: OnsiteMethod) {
    setMethod(m);
    // If already settled, re-persist so the recorded method stays correct.
    if (settled) persistPayment(m, true);
  }

  function adjustDeposit(delta: number) {
    setErrMsg(null);
    startTransition(async () => {
      const r = await adminAdjustClientDepositAction({
        userId: row.userId,
        delta,
      });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      setDeposits(r.deposits);
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
            {isOnsite && settled && (
              <span className="ml-1.5 text-emerald-600">· платено ✓</span>
            )}
          </p>
        </div>
        <StatusChip status={row.status} />
      </div>

      <MoneyNote status={row.status} source={row.source} cardPaid={row.cardPaid} />

      {/* Deposit management (admins only). Records that a client paid a
          deposit at the desk, or removes one. Discrete units (€10 each). */}
      {canManageDeposits && (
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
            Депозити:{" "}
            <strong
              className={
                deposits > 0
                  ? "text-[color:var(--brand-magenta)]"
                  : "text-[color:var(--brand-purple)]/50"
              }
            >
              {deposits}
            </strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustDeposit(-1)}
              disabled={pending || deposits <= 0}
              aria-label="Свали един депозит"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--brand-pink)]/60 font-display text-lg font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => adjustDeposit(1)}
              disabled={pending}
              className="flex h-8 items-center justify-center rounded-lg bg-[color:var(--brand-magenta)] px-3 font-display text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
            >
              + Депозит
            </button>
          </div>
        </div>
      )}

      {/* On-site payment: method picker (same options as the booking modal). */}
      {isOnsite && (
        <div className="px-5 pb-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/55">
            Начин на плащане
          </label>
          <select
            value={method}
            onChange={(e) => handleMethodChange(e.target.value as OnsiteMethod)}
            disabled={pending}
            className="block w-full rounded-xl border border-[color:var(--brand-pink)]/60 bg-white px-3 py-2 text-sm font-medium text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none disabled:opacity-60"
          >
            <option value="cash">{METHOD_LABEL.cash}</option>
            <option value="subscription">{METHOD_LABEL.subscription}</option>
            <option value="multisport">{METHOD_LABEL.multisport}</option>
          </select>
        </div>
      )}

      {/* Action row. For on-site, „Разплати" sits between Дойде / Не дойде.
          When already marked, the buttons stay hidden until staff taps
          „Промени“ — so an accidental verdict can always be corrected. */}
      {!isMarked || editing ? (
        isOnsite ? (
          <div className="grid grid-cols-3 border-t border-[color:var(--brand-pink)]/30">
            <button
              type="button"
              disabled={pending}
              onClick={() => handle("attended")}
              aria-pressed={row.status === BookingStatus.attended}
              className="flex min-h-12 items-center justify-center bg-[color:var(--brand-magenta)] px-2 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
            >
              {pending ? "…" : "Дойде"}
            </button>
            <SettleButton
              settled={settled}
              pending={pending}
              onClick={() => persistPayment(method, !settled)}
              middle
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => handle("no_show")}
              aria-pressed={row.status === BookingStatus.no_show}
              className="flex min-h-12 items-center justify-center border-l border-[color:var(--brand-pink)]/40 bg-white px-2 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
            >
              {pending ? "…" : "Не дойде"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 border-t border-[color:var(--brand-pink)]/30">
            <button
              type="button"
              disabled={pending}
              onClick={() => handle("attended")}
              aria-pressed={row.status === BookingStatus.attended}
              className="flex min-h-12 items-center justify-center bg-[color:var(--brand-magenta)] px-4 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
            >
              {pending ? "…" : "Дойде"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handle("no_show")}
              aria-pressed={row.status === BookingStatus.no_show}
              className="flex min-h-12 items-center justify-center border-l border-[color:var(--brand-pink)]/40 bg-white px-4 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
            >
              {pending ? "…" : "Не дойде"}
            </button>
          </div>
        )
      ) : (
        // Attendance already marked — on-site payment can still be settled.
        isOnsite && (
          <div className="border-t border-[color:var(--brand-pink)]/30">
            <SettleButton
              settled={settled}
              pending={pending}
              onClick={() => persistPayment(method, !settled)}
            />
          </div>
        )
      )}

      {/* Correction affordance: reveal / hide the mark buttons once marked. */}
      {isMarked && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
          className="flex min-h-10 w-full items-center justify-center border-t border-[color:var(--brand-pink)]/30 bg-white px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70 transition-colors hover:bg-[color:var(--brand-pink-soft)] hover:text-[color:var(--brand-magenta)] disabled:opacity-60"
        >
          {editing ? "Отказ" : "Промени отбелязването"}
        </button>
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

function SettleButton({
  settled,
  pending,
  onClick,
  middle = false,
}: {
  settled: boolean;
  pending: boolean;
  onClick: () => void;
  middle?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center px-2 py-3 font-display text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-60 ${
        middle ? "border-l border-r border-[color:var(--brand-pink)]/40" : "w-full"
      } ${
        settled
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-magenta)] hover:bg-[color:var(--brand-pink)]/40"
      }`}
    >
      {pending ? "…" : settled ? "Платено ✓" : "Разплати"}
    </button>
  );
}

function StatusChip({ status }: { status: BookingStatus }) {
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
  // Phase 2b spec. For other statuses, keep the forward-looking copy.
  if (status === BookingStatus.no_show) {
    const text =
      source === BookingSource.card
        ? "Депозитът е удържан."
        : source === BookingSource.balance
          ? "Депозитът е удържан."
          : "Плащане на място.";
    return (
      <p className="mt-2 px-5 pb-2 text-[11px] leading-relaxed text-[color:var(--brand-magenta)]">
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
        ? 'Депозит · "Не дойде" → депозитът е удържан.'
        : "Депозит на място — маркирай начина на плащане и „Разплати“.";
  return (
    <p className="mt-2 px-5 pb-2 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
      {text}
    </p>
  );
}

function sourceLabel(source: BookingSource, cardPaid: boolean): string {
  if (source === BookingSource.card) {
    return cardPaid ? "Карта · платено" : "Карта · чака плащане";
  }
  if (source === BookingSource.balance) {
    return "Депозит";
  }
  return "На място";
}
