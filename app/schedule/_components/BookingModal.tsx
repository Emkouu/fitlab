"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { bookClassAction } from "../_actions";
import { Spinner } from "@/app/_components/Spinner";
import { RedirectOverlay } from "@/app/_components/RedirectOverlay";
import type { ClassCardRow } from "./ClassCard";

// UI payment methods offered in the picker. All three are paid at the desk →
// they all create an `onsite_deposit` booking (no schema change); the choice
// only tells staff how the client intends to pay. Card-online is intentionally
// NOT here yet — it lives behind the disabled „Потвърди" on the info step and
// is wired up when Stripe is enabled for this flow.
type Method = "cash" | "subscription" | "multisport";

const METHOD_LABEL: Record<Method, string> = {
  cash: "В брой",
  subscription: "Абонаментна карта",
  multisport: "Multisport",
};

// „Запознат/а съм, че …" line under the picker (deposit is settled on-site).
function ackText(method: Method): string {
  switch (method) {
    case "multisport":
      return "плащам с Multisport картата си на място, преди класа.";
    case "subscription":
      return "плащам с абонаментната си карта на място, преди класа.";
    default:
      return "плащам тренировката в брой на място, преди класа.";
  }
}

// Two-step wizard: „info" explains the deposit, „method" picks how to pay.
type Step = "info" | "method";

type Phase =
   | { kind: "form" }
   | { kind: "submitting" }
   | { kind: "success" }
   | { kind: "redirecting" }
   | { kind: "error"; message: string; reason: string };

/**
 * „Запазване на място" modal (CLAUDE.md booking-flow-reference). Renders as
 * a native <dialog> so we inherit focus trap, ESC-to-close, ::backdrop, and
 * inert background for free. Body scroll is locked while open via the
 * top-layer rendering modal dialogs get when shown with showModal().
 */
export function BookingModal({
  row,
  onClose,
  userBalance = 0,
}: {
  row: ClassCardRow | null;
  onClose: () => void;
  /** Deposit balance (EUR cents) on the profile. > 0 → skip the info step
   *  and open straight on the payment picker. */
  userBalance?: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [step, setStep] = useState<Step>("info");
  const [method, setMethod] = useState<Method>("cash");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  // Explicit "запознат съм" tick for the on-site deposit path so a client
  // can't claim they never saw how the deposit works.
  const [acknowledged, setAcknowledged] = useState(false);
  const [, startTransition] = useTransition();

  // Open / close the dialog imperatively in response to the row prop.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (row && !d.open) {
      // Reset state every time we open with a (possibly different) class.
      // Clients who already hold a deposit skip the info step and land on the
      // payment picker; everyone else starts on the info step. „В брой" default.
      setStep(userBalance > 0 ? "method" : "info");
      setMethod("cash");
      setAcknowledged(false);
      setPhase({ kind: "form" });
      d.showModal();
    } else if (!row && d.open) {
      d.close();
    }
  }, [row, userBalance]);

  // Reflect native dialog closes (ESC, backdrop click) back into parent state.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = () => onClose();
    const onCloseEvt = () => onClose();
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onCloseEvt);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onCloseEvt);
    };
  }, [onClose]);

  // Click-on-backdrop closes — only when the click lands outside the inner panel.
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  async function handleConfirm() {
    if (!row) return;
    setPhase({ kind: "submitting" });
    startTransition(async () => {
      const result = await bookClassAction({
        scheduledClassId: row.id,
        source: "onsite_deposit",
        method,
      });
      if (result.ok) {
        // Card path returns redirectTo → hand off to Stripe Checkout.
        if (result.redirectTo) {
          setPhase({ kind: "redirecting" });
          const url = result.redirectTo;
          await new Promise((r) => setTimeout(r, 300));
          window.location.href = url;
          return;
        }
        // On-site path: just show success + close.
        setPhase({ kind: "success" });
        router.refresh();
        setTimeout(() => {
          dialogRef.current?.close();
        }, 1400);
      } else if (result.reason === "unauthenticated") {
        // Bounce to /login carrying enough state to resume this exact booking
        // after the magic-link / OTP round-trip.
        const next = `/schedule?openBooking=${encodeURIComponent(row.id)}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
      } else {
        setPhase({
          kind: "error",
          reason: result.reason,
          message: result.message,
        });
      }
    });
  }

  return (
    <>
    {phase.kind === "redirecting" && <RedirectOverlay />}
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="booking-modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[400px] rounded-3xl border-none bg-white p-0 text-[color:var(--brand-ink)] shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] backdrop:bg-[rgba(42,14,46,0.55)] backdrop:backdrop-blur-sm open:animate-in"
    >
      {row && (
        <div className="font-sans">
          {/* Close + title bar */}
          <div className="flex items-center justify-between border-b border-[color:var(--brand-pink)]/40 px-5 py-3">
            <h2
              id="booking-modal-title"
              className="font-display text-base font-bold tracking-tight"
            >
              Запазване на място
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Затвори"
              className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-purple)]/70 hover:bg-[color:var(--brand-pink-soft)] hover:text-[color:var(--brand-magenta)]"
            >
              <Close className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
            {phase.kind === "success" ? (
              <SuccessState row={row} method={method} />
            ) : (
              <>
                <ClassSummary row={row} />
                {/* Class full banner */}
                {row.capacity - row._count.bookings <= 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-5 rounded-2xl bg-red-50 px-4 py-3 border border-red-200"
                  >
                    <p className="font-display text-[13px] font-bold text-red-700">
                      Класът е пълен. Не можеш да се запишеш.
                    </p>
                  </motion.div>
                )}
                {step === "info" ? (
                  /* ── Step 1: информация за депозита ── */
                  <Section
                    title="Депозит"
                    trailing={
                      <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                        {formatEurMinor(row.depositAmount)}
                      </span>
                    }
                  >
                    <p className="text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
                      За запазване на място за тренировка е необходим депозит.
                      Може да бъде заплатен на място в студиото.
                    </p>
                  </Section>
                ) : (
                  /* ── Step 2: избор на начин на плащане ── */
                  <Section
                    title="Как ще заплатиш тренировката?"
                    trailing={
                      <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                        {formatEurMinor(row.depositAmount)}
                      </span>
                    }
                  >
                    <MethodPicker
                      value={method}
                      onChange={(m) => {
                        setMethod(m);
                        setAcknowledged(false);
                      }}
                      disabled={phase.kind === "submitting"}
                    />
                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl bg-[color:var(--brand-pink-soft)]/60 px-3.5 py-3">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        disabled={phase.kind === "submitting"}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand-magenta)]"
                      />
                      <span className="text-[12px] leading-relaxed text-[color:var(--brand-purple)]/85">
                        Запознат/а съм, че {ackText(method)}
                      </span>
                    </label>
                  </Section>
                )}
                <Section title="Отказ">
                  <ul className="space-y-1 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/75">
                    <li>
                      Можеш да отмениш{" "}
                      <strong className="font-display text-[color:var(--brand-purple)]">
                        до {row.studio.cancelWindowHours} часа
                      </strong>{" "}
                      преди класа — депозитът се връща.
                    </li>
                    <li>След това депозитът се удържа.</li>
                    <li>Неявяване — депозитът се удържа.</li>
                  </ul>
                </Section>
                {phase.kind === "error" && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="mb-4 rounded-2xl bg-[color:var(--brand-pink-soft)] px-4 py-3 text-[13px] text-[color:var(--brand-magenta)]"
                  >
                    {phase.message}
                  </motion.p>
                )}
              </>
            )}
          </div>

          {/* Footer CTA */}
          {phase.kind !== "success" &&
            (() => {
              const full = row.capacity - row._count.bookings <= 0;
              const primaryBtn =
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60";
              return (
                <div className="space-y-2.5 border-t border-[color:var(--brand-pink)]/40 bg-white px-5 py-4">
                  {step === "info" ? (
                    <>
                      {/* Active path → step 2 (on-site payment) */}
                      <button
                        type="button"
                        onClick={() => setStep("method")}
                        disabled={full}
                        className={primaryBtn}
                      >
                        Плащане на място <Arrow />
                      </button>
                      {/* „Потвърди" stays grey/inactive — reserved for the
                          future card-online path (wired when Stripe is on). */}
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Плащане с карта — предстои"
                        className="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-[color:var(--brand-pink)]/50 bg-[color:var(--brand-pink-soft)]/40 px-5 py-3 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/40"
                      >
                        Потвърди с карта (скоро)
                      </button>
                    </>
                  ) : (
                    <div className="flex items-stretch gap-2.5">
                      {/* „Назад" only when the info step is part of this flow.
                          Deposit-holders skip it, so there's nothing to go back to. */}
                      {userBalance <= 0 && (
                        <button
                          type="button"
                          onClick={() => setStep("info")}
                          disabled={phase.kind === "submitting"}
                          className="flex min-h-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--brand-pink)]/60 px-4 font-display text-sm font-bold text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
                        >
                          ← Назад
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={
                          phase.kind === "submitting" || full || !acknowledged
                        }
                        className={primaryBtn}
                      >
                        {phase.kind === "submitting" ? (
                          <>
                            <Spinner size={18} />
                            <span>Запазване</span>
                          </>
                        ) : phase.kind === "error" ? (
                          <>Опитай отново</>
                        ) : (
                          <>
                            Потвърди <Arrow />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </dialog>
    </>
  );
}

/* ─── helpers ─── */

function ClassSummary({ row }: { row: ClassCardRow }) {
  const startAt = typeof row.startAt === "string" ? new Date(row.startAt) : row.startAt;
  const { weekday, date } = splitDay(formatSofiaDay(startAt));
  return (
    <div className="mb-5 rounded-2xl bg-[color:var(--brand-pink-soft)]/60 px-4 py-3">
      <p className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
        {weekday} · {date}
      </p>
      <p className="mt-1 font-display text-xl font-bold leading-tight tracking-tight text-[color:var(--brand-magenta)]">
        {formatSofiaTime(startAt)}{" "}
        <span className="ml-1 font-mono text-xs uppercase tracking-wider text-[color:var(--brand-purple)]/55">
          · {row.durationMinutes} мин
        </span>
      </p>
      <h3 className="mt-2 font-display text-base font-semibold leading-tight">
        {row.practice.name}
      </h3>
      <p className="text-sm text-[color:var(--brand-purple)]/75">
        с {row.trainers.map((t) => t.name).join(" & ")}
      </p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/55">
        {row.studio.name}
      </p>
    </div>
  );
}

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
          {title}
        </h4>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function MethodPicker({
  value,
  onChange,
  disabled,
}: {
  value: Method;
  onChange: (m: Method) => void;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Method)}
        disabled={disabled}
        aria-label="Начин на плащане"
        className="block w-full appearance-none rounded-2xl border border-[color:var(--brand-pink)]/60 bg-white px-4 py-3 pr-10 text-sm font-medium text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60"
      >
        <option value="cash">{METHOD_LABEL.cash}</option>
        <option value="subscription">{METHOD_LABEL.subscription}</option>
        <option value="multisport">{METHOD_LABEL.multisport}</option>
      </select>
      <Chevron className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--brand-magenta)]" />
    </div>
  );
}

function SuccessState({ row, method }: { row: ClassCardRow; method: Method }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-pink-soft)]">
        <Check className="h-6 w-6 text-[color:var(--brand-magenta)]" />
      </div>
      <h3 className="font-display text-lg font-bold">Готово</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/75">
        Записан/а за <strong>{row.practice.name}</strong>.
      </p>
      <p className="mt-1 text-[12px] text-[color:var(--brand-purple)]/55">
        {method === "multisport"
          ? "Покажи Multisport картата си на място — преди класа."
          : method === "subscription"
          ? "Плати с абонаментната си карта на място — преди класа."
          : "Плати депозита в брой на място — преди класа."}
      </p>
    </div>
  );
}

function splitDay(formatted: string): { weekday: string; date: string } {
  const m = formatted.match(/^([^,]+),\s*(.+?)(?:\s*г\.?)?$/);
  if (!m) return { weekday: formatted, date: "" };
  return { weekday: m[1], date: m[2] };
}

/* ─── icons ─── */

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function Close({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
