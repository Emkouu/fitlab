"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Top-of-page banner that surfaces a Stripe Checkout outcome:
 *   ?paid=<bookingId>     → green-tinted success banner
 *   ?canceled=<bookingId> → muted "не е потвърдено" banner
 *
 * Strips the query param after first render so the banner doesn't pop
 * back on every refresh/HMR.
 */
export function PaymentBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const [phase, setPhase] = useState<"paid" | "canceled" | null>(() => {
    if (params.get("paid")) return "paid";
    if (params.get("canceled")) return "canceled";
    return null;
  });

  useEffect(() => {
    if (!phase) return;
    const next = new URLSearchParams(params);
    next.delete("paid");
    next.delete("canceled");
    const qs = next.toString();
    router.replace(`/schedule${qs ? `?${qs}` : ""}`, { scroll: false });
    // We deliberately keep `phase` set so the banner stays visible after
    // the URL is cleaned; user can dismiss by clicking ×.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!phase) return null;

  return (
    <div
      role="status"
      className={
        phase === "paid"
          ? "mb-4 flex items-start gap-3 rounded-2xl border border-[color:var(--brand-magenta)]/30 bg-[color:var(--brand-pink-soft)] px-4 py-3"
          : "mb-4 flex items-start gap-3 rounded-2xl border border-[color:var(--brand-purple)]/20 bg-white px-4 py-3"
      }
    >
      <div className="mt-0.5 shrink-0">
        {phase === "paid" ? <Check /> : <Info />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold tracking-tight text-[color:var(--brand-purple)]">
          {phase === "paid" ? "Плащането мина" : "Резервацията не е потвърдена"}
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/70">
          {phase === "paid"
            ? "Депозитът е зареден, мястото е успешно запазено."
            : "Можеш да опиташ отново — спотът ти все още е запазен до края на деня."}
        </p>
      </div>
      <button
        type="button"
        aria-label="Скрий"
        onClick={() => setPhase(null)}
        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--brand-purple)]/55 hover:bg-white hover:text-[color:var(--brand-magenta)]"
      >
        <X />
      </button>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 text-[color:var(--brand-magenta)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M6 10.5l2.8 2.8L14 8" />
    </svg>
  );
}
function Info() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 text-[color:var(--brand-purple)]/55" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6.5v4.5M10 13.5v.01" />
    </svg>
  );
}
function X() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
