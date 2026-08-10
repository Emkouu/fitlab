"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { depositAmountMinor, hasDepositFor } from "@/lib/deposit";
import { classPriceMinor } from "@/lib/pricing";
import {
  CLASS_FEE_METHODS,
  CLASS_FEE_METHOD_LABEL,
  type ClassFeeMethod,
} from "@/lib/payments/classFeeMethods";
import { bookClassAction } from "../_actions";
import { Spinner } from "@/app/_components/Spinner";
import type { ClassCardRow } from "./ClassCard";

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; reason: string };

/**
 * „Запазване на място" modal (CLAUDE.md booking-flow-reference).
 *
 * Deposit model (see lib/deposit.ts): the deposit (€10) is paid ONCE at the
 * studio and stays on the profile — it is what makes reserving possible, and
 * booking does not spend it. A client with no deposit can't reserve online and
 * sees the explanation + the „плати в студиото" nudge; a client who already
 * has one sees no deposit talk at all, just the class-fee method picker.
 *
 * The class fee itself is NOT collected here — the client says how they intend
 * to pay (абонаментна карта / в брой / Multisport) and staff confirm it on
 * site in Attendance. Its **price is shown** regardless: the acquirer requires
 * the final price of the service to be visible at every step that leads to a
 * transaction (Fibank instruction §I.8).
 *
 * Two things here are acquirer requirements, not product choices:
 *   * the deposit's terms of use and refund conditions are stated in the form
 *     itself, not only in the Общи условия;
 *   * „Приемам Общите условия" is a mandatory, unticked checkbox — Потвърди
 *     stays disabled until it is ticked, so nobody reaches the bank's
 *     card-data page without having agreed. The server re-checks.
 *
 * Renders as a native <dialog> so we inherit focus trap, ESC-to-close,
 * ::backdrop, and inert background for free.
 */
export function BookingModal({
  row,
  onClose,
  userBalance = 0,
}: {
  row: ClassCardRow | null;
  onClose: () => void;
  /** Standing deposit (EUR cents) on the profile. */
  userBalance?: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  // How the client intends to pay the class fee on site. "" until chosen —
  // Потвърди stays disabled so staff always get an answer.
  const [method, setMethod] = useState<ClassFeeMethod | "">("");
  // Mandatory consent with the Общи условия. Never pre-ticked.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [, startTransition] = useTransition();

  // What this class asks for: the studio setting unless the class overrides it.
  const depositRequired = depositAmountMinor(row, row?.studio);
  const hasDeposit = hasDepositFor(userBalance, depositRequired);
  // A client without a deposit can pay it online, when the studio has card
  // payments switched on — otherwise the only route is paying it at the studio.
  const canPayDepositByCard = !hasDeposit && (row?.studio.cardPaymentsEnabled ?? false);

  // Open / close the dialog imperatively in response to the row prop.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (row && !d.open) {
      setMethod("");
      setTermsAccepted(false);
      setPhase({ kind: "form" });
      d.showModal();
    } else if (!row && d.open) {
      d.close();
    }
  }, [row]);

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

  async function handleConfirm(source: "balance" | "card") {
    if (!row) return;
    setPhase({ kind: "submitting" });
    startTransition(async () => {
      // source "balance" == backed by the standing deposit on the profile.
      // The deposit is NOT debited; the chosen method is how the class fee
      // will be settled on site. source "card" pays the one-off deposit now,
      // through Fibank's virtual POS.
      const result = await bookClassAction({
        scheduledClassId: row.id,
        source,
        method: method === "" ? undefined : method,
        acceptTerms: termsAccepted,
      });
      if (result.ok) {
        if (result.redirectTo) {
          // Card path — hand the browser to the /pay hop, which POSTs onward to
          // the bank. Don't flash a success state for money that hasn't moved.
          router.push(result.redirectTo);
          return;
        }
        setPhase({ kind: "success" });
        router.refresh();
        setTimeout(() => {
          dialogRef.current?.close();
        }, 1400);
      } else if (result.reason === "unauthenticated") {
        // Bounce to /login carrying enough state to resume this exact booking
        // after the OTP round-trip.
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

  const full = row ? row.capacity - row._count.bookings <= 0 : false;

  return (
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
              <SuccessState row={row} />
            ) : (
              <>
                <ClassSummary row={row} />

                {/* Class full banner */}
                {full && (
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

                {/* Price of the service itself. Shown to everyone, always —
                    the acquirer requires the end price to be visible at every
                    step that leads to a transaction. */}
                <Section
                  title="Цена на тренировката"
                  trailing={
                    <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                      {formatEurMinor(classPriceMinor(row.practice, row.studio))}
                    </span>
                  }
                >
                  <p className="text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
                    Крайна цена за едно посещение, с включени всички данъци.
                    Заплаща се на място в студиото.
                  </p>
                </Section>

                {/* Deposit section — only for clients who don't have one yet.
                    A client with a paid deposit has nothing to read here; they
                    get the class-fee picker instead. */}
                {!hasDeposit && (
                  <Section
                    title="Депозит (еднократно)"
                    trailing={
                      <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                        {formatEurMinor(depositRequired)}
                      </span>
                    }
                  >
                    <p className="text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
                      Депозитът в размер на {formatEurMinor(depositRequired)}{" "}
                      се заплаща <strong>еднократно</strong> и е отделен от
                      цената на тренировката. Той ти дава възможност да запазваш
                      място онлайн.
                    </p>
                    <DepositTerms cancelWindowHours={row.studio.cancelWindowHours} />

                    {canPayDepositByCard ? (
                      <div className="mt-3 rounded-2xl border border-[color:var(--brand-pink)]/70 bg-[color:var(--brand-pink-soft)]/40 px-3.5 py-3">
                        <p className="text-[12px] leading-relaxed text-[color:var(--brand-purple)]/80">
                          Можеш да платиш депозита сега с банкова карта, или да
                          го оставиш в студиото преди първата си тренировка.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                        <p className="text-[12px] leading-relaxed text-amber-800">
                          Нямаш платен депозит. Плати депозит в студиото, за да
                          можеш да запазиш място.
                        </p>
                      </div>
                    )}
                  </Section>
                )}

                {/* Class fee — how the client will pay on site. */}
                {hasDeposit && (
                  <Section title="Плащане на тренировката">
                    <label
                      htmlFor="booking-fee-method"
                      className="mb-1.5 block text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80"
                    >
                      Избери как ще заплатиш тренировката:
                    </label>
                    <select
                      id="booking-fee-method"
                      value={method}
                      onChange={(e) =>
                        setMethod(e.target.value as ClassFeeMethod)
                      }
                      disabled={phase.kind === "submitting" || full}
                      className="block w-full rounded-2xl border border-[color:var(--brand-pink)]/70 bg-white px-3.5 py-3 text-sm font-medium text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60"
                    >
                      <option value="" disabled>
                        — избери —
                      </option>
                      {CLASS_FEE_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {CLASS_FEE_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/65">
                      Цената се заплаща на място. Депозитът ти остава по
                      профила.
                    </p>
                  </Section>
                )}

                <Section title="Отказ от резервация и депозит">
                  <ul className="space-y-1 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/75">
                    <li>
                      Можеш да се отпишеш{" "}
                      <strong className="font-display text-[color:var(--brand-purple)]">
                        до {row.studio.cancelWindowHours} часа
                      </strong>{" "}
                      преди класа — депозитът остава по профила ти.
                    </li>
                    <li>След това депозитът се усвоява.</li>
                    <li>Неявяване — депозитът се усвоява.</li>
                  </ul>
                  {hasDeposit && (
                    <DepositTerms cancelWindowHours={row.studio.cancelWindowHours} />
                  )}
                </Section>

                {/* Mandatory consent. Must be given before the client can be
                    sent to the card-data page (acquirer requirement), so it
                    gates Потвърди on every path. */}
                <Section title="Общи условия">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[color:var(--brand-pink)]/70 bg-white px-3.5 py-3 transition-colors hover:bg-[color:var(--brand-pink-soft)]/40">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      disabled={phase.kind === "submitting" || full}
                      required
                      aria-describedby="booking-terms-hint"
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[color:var(--brand-magenta)]"
                    />
                    <span
                      id="booking-terms-hint"
                      className="text-[12px] leading-relaxed text-[color:var(--brand-purple)]/85"
                    >
                      Прочетох и приемам{" "}
                      <Link
                        href="/policies#terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[color:var(--brand-magenta)] underline"
                      >
                        Общите условия
                      </Link>{" "}
                      и{" "}
                      <Link
                        href="/policies#privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[color:var(--brand-magenta)] underline"
                      >
                        Политиката за поверителност
                      </Link>
                      , включително условията за отказ, ползване и възстановяване
                      на депозита.
                    </span>
                  </label>
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
          {phase.kind !== "success" && (
            <div className="space-y-2.5 border-t border-[color:var(--brand-pink)]/40 bg-white px-5 py-4">
              {/* Client with a standing deposit: confirm and go. */}
              {hasDeposit && (
                <button
                  type="button"
                  onClick={() => handleConfirm("balance")}
                  disabled={
                    phase.kind === "submitting" || full || method === "" || !termsAccepted
                  }
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60"
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
              )}

              {/* No deposit yet, card payments on: pay the one-off deposit now.
                  The label names the amount, and consent is already required —
                  the next screen is the bank's card form. */}
              {canPayDepositByCard && (
                <button
                  type="button"
                  onClick={() => handleConfirm("card")}
                  disabled={phase.kind === "submitting" || full || !termsAccepted}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {phase.kind === "submitting" ? (
                    <>
                      <Spinner size={18} />
                      <span>Пренасочване</span>
                    </>
                  ) : phase.kind === "error" ? (
                    <>Опитай отново</>
                  ) : (
                    <>
                      Плати депозит {formatEurMinor(depositRequired)} с карта{" "}
                      <Arrow />
                    </>
                  )}
                </button>
              )}

              {/* Neither path available — nothing to press, so say why. */}
              {!hasDeposit && !canPayDepositByCard && (
                <p className="text-center text-[12px] leading-relaxed text-[color:var(--brand-purple)]/70">
                  За да запазиш място, плати еднократния депозит в студиото.
                </p>
              )}

              {!termsAccepted && (hasDeposit || canPayDepositByCard) && (
                <p className="text-center text-[11px] text-[color:var(--brand-purple)]/60">
                  Отбележи съгласието с Общите условия, за да продължиш.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </dialog>
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

/**
 * The deposit's terms of use and refund conditions, in the booking form itself.
 *
 * The acquirer asked specifically for this: the form says „депозитът остава по
 * профила" and that sentence alone doesn't tell the client how long it stays,
 * what it can be used for, or whether they can have the money back if they
 * don't want another class. All three answers live here, and the same wording
 * is expanded in the Общи условия.
 */
function DepositTerms({ cancelWindowHours }: { cancelWindowHours: number }) {
  return (
    <ul className="mt-3 space-y-1.5 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 px-3.5 py-3 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/80">
      <li>
        <strong>Ползване:</strong> депозитът е <strong>безсрочен</strong> — стои
        по профила ти и важи за неограничен брой следващи резервации. Записването
        не го изразходва.
      </li>
      <li>
        <strong>Не се приспада</strong> от цената на тренировката — тя се плаща
        отделно, на място.
      </li>
      <li>
        <strong>Усвоява се</strong> при неявяване или при отписване по-късно от{" "}
        {cancelWindowHours} часа преди класа. За нова резервация се дължи нов
        депозит.
      </li>
      <li>
        <strong>Възстановяване:</strong> ако не искаш да го ползваш повече, пиши
        ни и възстановяваме сумата в срок до <strong>14 дни</strong> — платените
        с карта депозити се връщат{" "}
        <strong>по същата карта</strong>, платените в брой — в брой в студиото.
      </li>
    </ul>
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

function SuccessState({ row }: { row: ClassCardRow }) {
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
        Депозитът ти остава по профила. Таксата за тренировката се плаща на
        място.
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
function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
