"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatEurMinor } from "@/lib/format";
import { refundDepositAction } from "@/app/admin/_actions";

export type RefundablePayment = {
  id: string;
  amount: number;
  /** Masked card, when the bank gave us one. */
  cardMask: string | null;
  /** Pre-formatted transaction date. */
  dateText: string;
};

/**
 * „Възстанови депозит" — the desk tool behind the promise in the Общи условия
 * that a client who doesn't want to use their deposit can have it back.
 *
 * Card-paid deposits are returned by a card operation to the same card; that is
 * the only route the acquirer permits (Fibank instruction §I.16), so it is the
 * only card option offered here. Cash deposits are handed back at the desk and
 * the button only clears the recorded balance.
 *
 * super_admin only — the action re-checks the role server-side.
 */
export function DepositRefundPanel({
  userId,
  depositBalance,
  refundablePayments,
  canRefund,
}: {
  userId: string;
  depositBalance: number;
  refundablePayments: RefundablePayment[];
  canRefund: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentId, setPaymentId] = useState<string>(
    refundablePayments[0]?.id ?? "",
  );
  const [feedback, setFeedback] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [confirming, setConfirming] = useState<"card" | "cash" | null>(null);

  const hasDeposit = depositBalance > 0;
  if (!hasDeposit) return null;

  async function submit(method: "card" | "cash") {
    setFeedback(null);
    const result = await refundDepositAction({
      userId,
      method,
      paymentId: method === "card" ? paymentId : undefined,
    });
    setFeedback({ ok: result.ok, message: result.message });
    setConfirming(null);
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--brand-purple)]/15 bg-white p-5">
      <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
        Възстановяване на депозит
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
        Клиентът има депозит {formatEurMinor(depositBalance)} по профила. Ако не
        желае да го ползва за следващи класове, върни му сумата — по същата карта,
        ако е платена с карта, или в брой, ако е оставена на място.
      </p>

      {!canRefund && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Само super admin може да възстановява депозити.
        </p>
      )}

      {canRefund && (
        <>
          {refundablePayments.length > 0 ? (
            <div className="mt-4">
              <label
                htmlFor="refund-payment"
                className="block text-xs font-semibold text-[color:var(--brand-ink)]"
              >
                Транзакция за връщане по карта
              </label>
              <select
                id="refund-payment"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                disabled={isPending}
                className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              >
                {refundablePayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dateText} · {formatEurMinor(p.amount)}
                    {p.cardMask ? ` · ${p.cardMask}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-[color:var(--brand-pink-soft)]/60 px-3 py-2 text-xs text-[color:var(--brand-purple)]/75">
              Няма платена с карта транзакция — депозитът е оставен в брой и се
              връща в брой в студиото.
            </p>
          )}

          <div className="mt-4 space-y-2">
            {refundablePayments.length > 0 && (
              <ConfirmButton
                label={`Върни ${formatEurMinor(depositBalance)} по картата`}
                confirmLabel="Потвърди връщането по карта"
                active={confirming === "card"}
                disabled={isPending || paymentId === ""}
                onArm={() => setConfirming("card")}
                onConfirm={() => submit("card")}
                onCancel={() => setConfirming(null)}
              />
            )}
            <ConfirmButton
              label="Отбележи връщане в брой"
              confirmLabel="Потвърди връщането в брой"
              active={confirming === "cash"}
              disabled={isPending}
              variant="secondary"
              onArm={() => setConfirming("cash")}
              onConfirm={() => submit("cash")}
              onCancel={() => setConfirming(null)}
            />
          </div>
        </>
      )}

      {feedback && (
        <p
          role="status"
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}

/** Two-step button so a single mis-tap never moves money. */
function ConfirmButton({
  label,
  confirmLabel,
  active,
  disabled,
  variant = "primary",
  onArm,
  onConfirm,
  onCancel,
}: {
  label: string;
  confirmLabel: string;
  active: boolean;
  disabled: boolean;
  variant?: "primary" | "secondary";
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const base =
    "w-full rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-[color:var(--brand-magenta)] text-white hover:bg-[color:var(--brand-purple)]"
      : "border border-[color:var(--brand-purple)]/25 text-[color:var(--brand-purple)] hover:bg-[color:var(--brand-pink-soft)]";

  if (!active) {
    return (
      <button type="button" onClick={onArm} disabled={disabled} className={`${base} ${styles}`}>
        {label}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className={`${base} bg-red-600 text-white hover:bg-red-700`}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="rounded-xl border border-[color:var(--brand-purple)]/25 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--brand-purple)] hover:bg-[color:var(--brand-pink-soft)]"
      >
        Откажи
      </button>
    </div>
  );
}
