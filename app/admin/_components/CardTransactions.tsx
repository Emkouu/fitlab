"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  recheckPaymentAction,
  refundTransactionAction,
} from "@/app/admin/_actions";
import type {
  CardTransactionAttemptView,
  CardTransactionGroupView,
} from "./cardTransactionView";

/**
 * „Картови транзакции" — the full record of what the bank told us, readable from
 * the desk.
 *
 * It exists because the acquirer asks, by `TrnID`, what we have recorded for a
 * given transaction, and because a retried card leaves several transactions
 * behind one booking. Every attempt is shown, superseded ones included, with the
 * identifiers the bank uses to trace a payment (`TrnID`, RRN, approval code) in
 * a form that can be copied into a reply.
 */
export function CardTransactions({
  groups,
  canRefund = false,
  emptyText = "Няма картови транзакции.",
}: {
  groups: CardTransactionGroupView[];
  /** super_admin — only they may send money back (the action re-checks). */
  canRefund?: boolean;
  emptyText?: string;
}) {
  if (groups.length === 0) {
    return (
      <p className="rounded-xl bg-[color:var(--brand-pink-soft)]/50 px-3 py-2 text-xs text-[color:var(--brand-purple)]/75">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {groups.map((group) => (
        <li
          key={group.paymentId}
          className="rounded-2xl border border-[color:var(--brand-purple)]/15 bg-white p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              {group.clientLabel && group.clientHref && (
                <Link
                  href={group.clientHref}
                  className="block truncate font-display text-sm font-bold text-[color:var(--brand-magenta)] hover:underline"
                >
                  {group.clientLabel}
                </Link>
              )}
              {group.classText && (
                <p className="truncate text-xs text-[color:var(--brand-purple)]/75">
                  {group.classText}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge>{group.paymentStatusText}</Badge>
              {group.bookingStatusText && (
                <Badge muted>{group.bookingStatusText}</Badge>
              )}
            </div>
          </div>

          <ul className="mt-3 space-y-3">
            {group.attempts.map((attempt, index) => (
              <Attempt
                key={attempt.transId ?? `${group.paymentId}-${index}`}
                paymentId={group.paymentId}
                attempt={attempt}
                canRefund={canRefund}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Attempt({
  paymentId,
  attempt,
  canRefund,
}: {
  paymentId: string;
  attempt: CardTransactionAttemptView;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    setFeedback(null);
    const result = await action();
    setFeedback(result);
    setBusy(false);
    setArmed(false);
    if (result.ok) startTransition(() => router.refresh());
  }

  const recheck = () => run(() => recheckPaymentAction({ paymentId }));
  const refund = () => run(() => refundTransactionAction({ paymentId }));

  return (
    <li
      className={`rounded-xl px-3 py-2.5 text-xs ${
        attempt.isCurrent
          ? "bg-[color:var(--brand-pink-soft)]/40"
          : "bg-gray-50 text-[color:var(--brand-purple)]/70"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {attempt.result ?? "без резултат"}
          {!attempt.isCurrent && " · заменена"}
        </span>
        <span className="tabular-nums">{attempt.amountText}</span>
      </div>

      {attempt.transId && <CopyableId label="TrnID" value={attempt.transId} />}

      {/*
        The acquirer checks this screen against its own list of response fields,
        so they carry the bank's own names and every one of them is always
        rendered — a hidden row reads as a field we don't keep, when it only
        means the bank returned nothing for it.
      */}
      <dl className="mt-1.5 space-y-0.5">
        <Row label="RESULT" value={attempt.result} always />
        <Row label="RESULT_CODE" value={attempt.resultCodeText} always />
        <Row label="3DSECURE" value={attempt.threeDSecure} always />
        <Row label="RRN" value={attempt.rrn} always />
        <Row label="APPROVAL_CODE" value={attempt.approvalCode} always />
        <Row label="CARD_NUMBER" value={attempt.cardMask} always />
        <Row label="Час" value={attempt.atText} />
        <Row label="Върнато" value={attempt.refundText} />
      </dl>

      {attempt.canRecheck && (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/70">
            Транзакцията е регистрирана, но резултат не е получен — клиентът не се
            е върнал от страницата на банката.
          </p>
          <button
            type="button"
            onClick={recheck}
            disabled={busy || isPending}
            className="mt-2 rounded-lg border border-[color:var(--brand-purple)]/25 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
          >
            {busy ? "Проверява се…" : "Провери в банката"}
          </button>
        </>
      )}

      {/*
        Two taps to move money: the acquirer requires a way to return a paid sum
        in full, and this is the one place where the transaction itself is the
        starting point — no dependency on what the client's balance happens to be.
      */}
      {attempt.canRefund && canRefund && !armed && (
        <button
          type="button"
          onClick={() => setArmed(true)}
          disabled={busy || isPending}
          className="mt-2 rounded-lg border border-[color:var(--brand-purple)]/25 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
        >
          Върни сумата
        </button>
      )}
      {attempt.canRefund && canRefund && armed && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refund}
            disabled={busy || isPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Връща се…" : `Потвърди ${attempt.amountText} по картата`}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={busy}
            className="rounded-lg border border-[color:var(--brand-purple)]/25 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] hover:bg-[color:var(--brand-pink-soft)]"
          >
            Откажи
          </button>
        </div>
      )}

      {feedback && (
        <p
          role="status"
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </li>
  );
}

/** The identifier the bank quotes in its questions — one tap to copy it back. */
function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — the value is selectable on screen anyway.
        }
      }}
      title="Копирай"
      className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-left font-mono text-[11px] text-[color:var(--brand-ink)] ring-1 ring-inset ring-[color:var(--brand-purple)]/10 hover:ring-[color:var(--brand-purple)]/30"
    >
      <span className="shrink-0 font-sans text-[10px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-all">{value}</span>
      <span className="shrink-0 font-sans text-[10px] text-[color:var(--brand-purple)]/60">
        {copied ? "копирано" : "копирай"}
      </span>
    </button>
  );
}

/**
 * `always` keeps the row on screen with an em dash when the bank returned no
 * value — used for the six fields the acquirer requires us to record.
 */
function Row({
  label,
  value,
  always = false,
}: {
  label: string;
  value: string | null;
  always?: boolean;
}) {
  if (!value && !always) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--brand-purple)]/60">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">{value ?? "—"}</dd>
    </div>
  );
}

function Badge({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        muted
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : "border-[color:var(--brand-purple)]/20 bg-[color:var(--brand-pink-soft)]/60 text-[color:var(--brand-purple)]"
      }`}
    >
      {children}
    </span>
  );
}
