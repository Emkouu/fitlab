"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-POST the client to Fibank's ClientHandler (integration manual §4.4).
 *
 * The hop has to be a POST carrying `trans_id`, so this is a real form that
 * submits itself on mount. `booking_id` rides along as an additional parameter —
 * the manual guarantees extra parameters come back to us on the return leg,
 * which is how the return route finds the booking when the cross-site cookie
 * isn't available.
 *
 * The <noscript> submit button is required: without it a client with JavaScript
 * disabled would be stranded on this page.
 */
export function EcommRedirectForm({
  actionUrl,
  transId,
  bookingId,
}: {
  actionUrl: string;
  transId: string;
  bookingId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    // A tick of delay so the "пренасочваме те" copy actually renders first.
    const t = setTimeout(() => formRef.current?.submit(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <form ref={formRef} action={actionUrl} method="POST">
      <input type="hidden" name="trans_id" value={transId} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <noscript>
        <p className="mb-3 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
          Браузърът ти не изпълнява JavaScript. Натисни бутона, за да продължиш
          към защитената страница на банката.
        </p>
      </noscript>
      <button
        type="submit"
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
      >
        Продължи към плащане
      </button>
    </form>
  );
}
