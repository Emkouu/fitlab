"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markDepositFiscalizedAction } from "../_actions";

/**
 * „Чукнат на касата" — the one tap that says a burned deposit has been through
 * the register. The ringing up happens on the device; this only records that it
 * did, so nothing is rung twice and nothing is forgotten at month end.
 */
export function FiscalizeButton({
  bookingId,
  fiscalized,
  stornoNeeded = false,
}: {
  bookingId: string;
  fiscalized: boolean;
  /** The burn was undone after the receipt was printed. */
  stornoNeeded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle(next: boolean) {
    setErr(null);
    startTransition(async () => {
      const r = await markDepositFiscalizedAction({ bookingId, fiscalized: next });
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      router.refresh();
    });
  }

  if (stornoNeeded) {
    return (
      <div className="mt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(false)}
          className="rounded-full bg-[color:var(--brand-purple)] px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
        >
          {pending ? "…" : "Сторнирано"}
        </button>
        {err && <p className="mt-1.5 text-[11px] text-red-500">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      {fiscalized ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(false)}
          className="rounded-full border border-[color:var(--brand-pink)] px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70 disabled:opacity-50"
        >
          {pending ? "…" : "Свали отметката"}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(true)}
          className="rounded-full bg-[color:var(--brand-magenta)] px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
        >
          {pending ? "…" : "Чукнат на касата"}
        </button>
      )}
      {err && <p className="mt-1.5 text-[11px] text-red-500">{err}</p>}
    </div>
  );
}
