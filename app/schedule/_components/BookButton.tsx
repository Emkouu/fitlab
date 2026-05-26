"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PLACEHOLDER booking CTA.
 *
 * The real flow lands in roadmap steps 4–6 (auth → engine → UI). For now,
 * tapping this just flips the label to a brief "Скоро ✓" acknowledgement so
 * the visual position and tap target of the future CTA can be reviewed.
 *
 * No state is sent anywhere; this component knows nothing about the class.
 */
export function BookButton() {
  const [hit, setHit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    setHit(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHit(false), 1800);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (hit) {
    return (
      <button
        type="button"
        disabled
        aria-live="polite"
        className="flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--brand-pink-soft)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]"
      >
        <CheckMark />
        Скоро
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 active:bg-[color:var(--brand-purple)]"
    >
      Избор
      <Arrow />
    </button>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3.5 w-3.5 opacity-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}
