"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CONSENT_KEY = "fitlab-cookie-consent";

/**
 * Cookie notice (essential-only cookies — see /policies#cookies). Shows once
 * per device; the acknowledgement lives in localStorage so the layout can stay
 * a server component. Sits above BottomNav on mobile (body has pb-16 there).
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      // Storage unavailable (private mode) — skip the banner rather than nag.
    }
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } catch {
      // Ignore — banner still hides for this visit.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Съобщение за бисквитки"
      className="fixed inset-x-0 bottom-[4.25rem] z-50 px-4 md:bottom-4"
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3 rounded-3xl border border-[color:var(--brand-pink)]/60 bg-white p-4 shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] md:max-w-xl md:flex-row md:items-center">
        <p className="flex-1 text-[13px] leading-relaxed text-[color:var(--brand-ink)]/80">
          Използваме само строго необходими бисквитки, за да работи входът и
          резервациите — без реклами и проследяване.{" "}
          <Link
            href="/policies#cookies"
            className="font-semibold text-[color:var(--brand-magenta)] underline underline-offset-2 hover:text-[color:var(--brand-purple)]"
          >
            Научи повече
          </Link>
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="shrink-0 rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2"
        >
          Разбрах
        </button>
      </div>
    </div>
  );
}
