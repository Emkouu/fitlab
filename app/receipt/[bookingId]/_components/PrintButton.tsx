"use client";

/**
 * The receipt page must offer a print option (Fibank instruction §I.15).
 * A one-line client island keeps the rest of the page a server component.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-3 font-display text-xs font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] print:hidden"
    >
      Отпечатай разписката
    </button>
  );
}
