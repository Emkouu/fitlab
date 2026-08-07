"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Surfaces the outcome of a card payment after the client comes back from the
 * bank.
 *
 * The Fibank return leg (`/api/payments/ecomm/return`) can only redirect to a
 * plain GET page, so it carries the verdict in `?payment=`. A success never
 * lands here — it goes straight to the receipt — which leaves the cases where
 * something needs explaining:
 *
 *   ?payment=failed   → the bank declined or the client abandoned the card page
 *   ?payment=pending  → the bank hasn't finished; the result isn't in yet
 *   ?payment=error    → we couldn't read the result from the bank
 *   ?payment=unknown  → the return POST couldn't be tied to a booking
 *   ?payment=restart  → the registered transaction is stale; book again
 *
 * The query param is stripped after the first render so the banner doesn't pop
 * back on refresh, while the banner itself stays until dismissed.
 */
const VARIANTS = {
  failed: {
    tone: "warn",
    title: "Плащането не е успешно",
    body: "Мястото ти се пази още около 15 минути. Опитай отново от „Резервации“ по-долу или плати депозита на място в студиото.",
  },
  pending: {
    tone: "info",
    title: "Плащането се обработва",
    body: "Банката още не е потвърдила транзакцията. Ще получиш имейл с разписка веднага щом това стане.",
  },
  error: {
    tone: "warn",
    title: "Не успяхме да проверим плащането",
    body: "Възможно е сумата да е удържана. Не плащай втори път — свържи се с нас и ще проверим.",
  },
  unknown: {
    tone: "warn",
    title: "Не разпознахме плащането",
    body: "Провери резервациите си по-долу. Ако сумата е удържана, а резервацията не е потвърдена, пиши ни.",
  },
  restart: {
    tone: "info",
    title: "Започни плащането отново",
    body: "Предишният опит за плащане вече не е активен. Избери класа отново, за да продължиш.",
  },
} as const;

type Variant = keyof typeof VARIANTS;

function readVariant(value: string | null): Variant | null {
  if (value && value in VARIANTS) return value as Variant;
  return null;
}

export function PaymentBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [variant, setVariant] = useState<Variant | null>(() =>
    readVariant(params.get("payment")),
  );

  useEffect(() => {
    if (!variant) return;
    const next = new URLSearchParams(params);
    next.delete("payment");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    // Runs once: `variant` deliberately stays set so the banner survives the
    // URL cleanup and is dismissed by the user, not by the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!variant) return null;
  const { tone, title, body } = VARIANTS[variant];

  return (
    <div
      role="status"
      className={
        tone === "warn"
          ? "mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3"
          : "mb-4 flex items-start gap-3 rounded-2xl border border-[color:var(--brand-purple)]/20 bg-white px-4 py-3"
      }
    >
      <div className="mt-0.5 shrink-0">
        <Info className={tone === "warn" ? "text-amber-700" : "text-[color:var(--brand-purple)]/55"} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`font-display text-sm font-bold tracking-tight ${
            tone === "warn" ? "text-amber-900" : "text-[color:var(--brand-purple)]"
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-0.5 text-[12px] leading-relaxed ${
            tone === "warn" ? "text-amber-800" : "text-[color:var(--brand-purple)]/70"
          }`}
        >
          {body}
        </p>
        {(variant === "error" || variant === "unknown") && (
          <Link
            href="/policies#terms"
            className="mt-1.5 inline-block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] hover:underline"
          >
            Контакти и рекламации
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Скрий"
        onClick={() => setVariant(null)}
        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--brand-purple)]/55 hover:bg-white hover:text-[color:var(--brand-magenta)]"
      >
        <X />
      </button>
    </div>
  );
}

function Info({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
