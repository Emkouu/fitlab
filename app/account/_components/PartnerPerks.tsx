"use client";

import { useState } from "react";

export type PartnerPerk = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  siteUrl: string | null;
  promoCode: string | null;
};

/**
 * Loyalty-program partner cards on the Profile page. Each card shows the
 * partner logo, an optional benefit line, a tap-to-copy promo code, and a
 * link to the partner's site.
 */
export function PartnerPerks({ partners }: { partners: PartnerPerk[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch {
      // Clipboard can be unavailable (http, permissions) — the code stays
      // visible on the card, so the user can select it manually.
    }
  }

  return (
    <ul className="space-y-3">
      {partners.map((p) => (
        <li
          key={p.id}
          className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
        >
          <div className="flex items-center gap-3">
            {p.logoUrl && (
              /* Remote partner logos come from arbitrary hosts → plain <img>. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={p.logoUrl}
                alt={p.name}
                loading="lazy"
                onError={(e) => {
                  // Broken/unreachable logo → swap in the initial-letter tile.
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.replace("hidden", "flex");
                }}
                className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-[color:var(--brand-pink)]/40"
              />
            )}
            {/* Initial-letter tile: fallback when no logo or the logo 404s. */}
            <div
              className={`${p.logoUrl ? "hidden" : "flex"} h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-pink-soft)] font-display text-xl font-bold text-[color:var(--brand-magenta)]`}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-[color:var(--brand-ink)]">
                {p.name}
              </p>
              {p.description && (
                <p className="mt-0.5 text-xs leading-snug text-[color:var(--brand-purple)]/70">
                  {p.description}
                </p>
              )}
            </div>
          </div>

          {(p.promoCode || p.siteUrl) && (
            <div className="mt-3 flex items-stretch gap-2">
              {p.promoCode && (
                <button
                  type="button"
                  onClick={() => copyCode(p.id, p.promoCode!)}
                  title="Копирай кода"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-dashed border-[color:var(--brand-magenta)]/40 bg-[color:var(--brand-pink-soft)]/50 px-3.5 py-2.5 text-left transition-colors hover:bg-[color:var(--brand-pink-soft)]"
                >
                  <span className="truncate font-mono text-sm font-bold tracking-wider text-[color:var(--brand-magenta)]">
                    {p.promoCode}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                    {copiedId === p.id ? "Копиран ✓" : "Копирай"}
                  </span>
                </button>
              )}
              {p.siteUrl && (
                <a
                  href={p.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-magenta)] px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
                >
                  Към сайта →
                </a>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
