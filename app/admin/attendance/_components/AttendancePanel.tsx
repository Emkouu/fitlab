"use client";

import { useState, useTransition } from "react";
import { formatEurMinor } from "@/lib/format";
import { useRouter } from "next/navigation";
import { BookingStatus, BookingSource } from "@/lib/generated/prisma/enums";
import { adminAdjustClientDepositAction } from "@/app/admin/_actions";
import { markAttendanceAction, setPaymentMethodAction } from "../_actions";
import {
  CLASS_FEE_METHODS,
  CLASS_FEE_METHOD_LABEL,
  isClassFeeMethod,
  type ClassFeeMethod,
} from "@/lib/payments/classFeeMethods";

export type AttendanceRow = {
  id: string;
  userId: string;
  status: BookingStatus;
  source: BookingSource;
  who: string;
  /** The standing deposit the client currently holds, in EUR cents. */
  depositMinor: number;
  cardPaid: boolean;
  /** Class-fee method the client picked when booking, or null. */
  onsiteMethod: string | null;
  /** Whether staff marked the on-site deposit as settled ("Разплати"). */
  depositSettled: boolean;
  /** Reserved through the „първо посещение" path — no deposit paid yet, and
   *  staff have to explain it and collect it at the desk. */
  isFirstVisit?: boolean;
  /** Card hold whose deposit never arrived — listed apart from „Записани". */
  unfinishedDeposit?: boolean;
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
  const [depositMinor, setDepositMinor] = useState(row.depositMinor);
  // "" = staff hasn't picked how the client pays the class fee yet. Prefilled
  // from what the client chose in the booking modal.
  const [method, setMethod] = useState<ClassFeeMethod | "">(
    isClassFeeMethod(row.onsiteMethod) ? row.onsiteMethod : "",
  );
  const [settled, setSettled] = useState(row.depositSettled);
  // When a booking is already marked, staff can re-open the buttons to correct
  // an accidental "Дойде"/"Не дойде" (e.g. client actually did / didn't show).
  const [editing, setEditing] = useState(false);

  const isOnsite = row.source === BookingSource.onsite_deposit;

  function handle(outcome: "attended" | "no_show") {
    setErrMsg(null);
    startTransition(async () => {
      const r = await markAttendanceAction({
        bookingId: row.id,
        outcome,
        // „Дойде" carries how the fee was paid; „Не дойде" has nothing to pay.
        method: outcome === "attended" && method !== "" ? method : undefined,
      });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function persistPayment(nextMethod: ClassFeeMethod, nextSettled?: boolean) {
    setErrMsg(null);
    startTransition(async () => {
      const r = await setPaymentMethodAction({
        bookingId: row.id,
        method: nextMethod,
        settled: nextSettled,
      });
      if (!r.ok) {
        setErrMsg(r.message);
        return;
      }
      setSettled(r.settled);
      router.refresh();
    });
  }

  function handleMethodChange(m: ClassFeeMethod) {
    setMethod(m);
    // Already marked (or already settled) → this is a correction, so persist
    // right away. Otherwise the value rides along with „Дойде".
    if (isMarked || settled) persistPayment(m);
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
      setDepositMinor(r.balanceMinor);
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
          {/* First time here — reserved without a deposit, so somebody has to
              explain it and take it at the desk. */}
          {row.isFirstVisit && (
            <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Първо посещение
            </p>
          )}
        </div>
        <StatusChip status={row.status} />
      </div>

      <MoneyNote status={row.status} source={row.source} cardPaid={row.cardPaid} />

      {/* Deposit management (admins only). Records that a client paid the
          deposit at the desk, or removes it. The amount granted comes from
          Админ → Настройки; what is shown is what the client actually holds. */}
      {canManageDeposits && (
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
            Депозит:{" "}
            <strong
              className={
                depositMinor > 0
                  ? "text-[color:var(--brand-magenta)]"
                  : "text-[color:var(--brand-purple)]/50"
              }
            >
              {depositMinor > 0 ? formatEurMinor(depositMinor) : "няма"}
            </strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustDeposit(-1)}
              disabled={pending || depositMinor <= 0}
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

      {/* Class-fee method (same options as the booking modal). Shown for every
          booking and editable after the fact, so a fee charged to the wrong
          person on the list can be corrected. */}
      <div className="px-5 pb-3">
        <label
          htmlFor={`method-${row.id}`}
          className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/55"
        >
          Плаща тренировката с
        </label>
        <select
          id={`method-${row.id}`}
          value={method}
          onChange={(e) => handleMethodChange(e.target.value as ClassFeeMethod)}
          disabled={pending}
          className="block w-full rounded-xl border border-[color:var(--brand-pink)]/60 bg-white px-3 py-2 text-sm font-medium text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none disabled:opacity-60"
        >
          <option value="" disabled>
            — избери —
          </option>
          {CLASS_FEE_METHODS.map((m) => (
            <option key={m} value={m}>
              {CLASS_FEE_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        {method === "" && !isMarked && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
            Избери начин на плащане, за да отбележиш „Дойде“.
          </p>
        )}
      </div>

      {/* Action row. For on-site, „Разплати" sits between Дойде / Не дойде.
          When already marked, the buttons stay hidden until staff taps
          „Промени“ — so an accidental verdict can always be corrected. */}
      {!isMarked || editing ? (
        isOnsite ? (
          <div className="grid grid-cols-3 border-t border-[color:var(--brand-pink)]/30">
            <button
              type="button"
              disabled={pending || method === ""}
              onClick={() => handle("attended")}
              aria-pressed={row.status === BookingStatus.attended}
              className="flex min-h-12 items-center justify-center bg-[color:var(--brand-magenta)] px-2 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
            >
              {pending ? "…" : "Дойде"}
            </button>
            <SettleButton
              settled={settled}
              pending={pending}
              disabled={method === ""}
              onClick={() => {
                if (method !== "") persistPayment(method, !settled);
              }}
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
              disabled={pending || method === ""}
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
              disabled={method === ""}
              onClick={() => {
                if (method !== "") persistPayment(method, !settled);
              }}
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
  disabled = false,
  onClick,
  middle = false,
}: {
  settled: boolean;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  middle?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={pending || disabled}
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
  // The deposit is a standing guarantee (lib/deposit.ts): „Дойде" leaves it
  // alone, „Не дойде" usvoyava it. Only the class fee moves at „Дойде".
  if (status === BookingStatus.no_show) {
    const text =
      source === BookingSource.onsite_deposit
        ? "Неявяване. Плащане на място."
        : "Депозитът е усвоен. За нова резервация клиентът плаща нов депозит.";
    return (
      <p className="mt-2 px-5 pb-2 text-[11px] leading-relaxed text-[color:var(--brand-magenta)]">
        {text}
      </p>
    );
  }

  if (status === BookingStatus.attended) {
    return (
      <p className="mt-2 px-5 pb-2 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        Дойде. Депозитът остава по профила за следващо записване.
      </p>
    );
  }

  const text =
    source === BookingSource.card && !cardPaid
      ? "Депозит с карта, без потвърдено плащане."
      : '„Дойде" → таксата се плаща на място, депозитът остава. „Не дойде" → депозитът се усвоява.';
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
