"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import type { ClassCardRow } from "./ClassCard";

/**
 * Read-only "Информация за класа" modal — opens when the user taps anywhere
 * on a class card body (the „Избор" CTA still routes to BookingModal).
 *
 * The CTA at the bottom mirrors the card's state (book / booked / full /
 * past); tapping „Запази място" closes this modal and asks the parent to
 * open the existing BookingModal.
 */
export function ClassInfoModal({
  row,
  onClose,
  onBook,
  isAuthed,
  isBooked,
}: {
  row: ClassCardRow | null;
  onClose: () => void;
  onBook: (row: ClassCardRow) => void;
  isAuthed: boolean;
  isBooked: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    else if (!row && d.open) d.close();
  }, [row]);

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

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="class-info-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[400px] rounded-3xl border-none bg-white p-0 text-[color:var(--brand-ink)] shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] backdrop:bg-[rgba(42,14,46,0.55)] backdrop:backdrop-blur-sm"
    >
      {row && <Body row={row} onClose={() => dialogRef.current?.close()} onBook={onBook} isAuthed={isAuthed} isBooked={isBooked} />}
    </dialog>
  );
}

function Body({
  row,
  onClose,
  onBook,
  isAuthed,
  isBooked,
}: {
  row: ClassCardRow;
  onClose: () => void;
  onBook: (row: ClassCardRow) => void;
  isAuthed: boolean;
  isBooked: boolean;
}) {
  const startAt =
    typeof row.startAt === "string" ? new Date(row.startAt) : row.startAt;
  const isPast = startAt.getTime() < Date.now();
  const isCancelled = row.cancelledAt !== null && row.cancelledAt !== undefined;
  const booked = row._count.bookings;
  const remaining = row.capacity - booked;
  const full = remaining <= 0;

  const { weekday, date } = splitDay(formatSofiaDay(startAt));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="font-sans"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--brand-pink)]/40 px-5 py-4">
        <h2
          id="class-info-title"
          className="font-display text-xl font-bold leading-tight tracking-tight text-[color:var(--brand-ink)]"
        >
          {row.practice.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори"
          className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--brand-purple)]/70 hover:bg-[color:var(--brand-pink-soft)] hover:text-[color:var(--brand-magenta)]"
        >
          <Close className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
        {row.practice.description && (
          <p className="mb-5 whitespace-pre-line text-[14px] leading-relaxed text-[color:var(--brand-purple)]/85">
            {row.practice.description}
          </p>
        )}

        <dl className="space-y-3">
          <InfoRow label="Кога">
            <span>{weekday}, {date} г.</span>{" "}
            <span className="font-display font-bold text-[color:var(--brand-magenta)]">
              в {formatSofiaTime(startAt)} ч.
            </span>
          </InfoRow>
          <InfoRow label="Продължителност">{row.durationMinutes} мин</InfoRow>
          <InfoRow label={row.trainers.length > 1 ? "Треньори" : "Треньор"}>
            {row.trainers.map((t) => t.name).join(" & ")}
          </InfoRow>
          <InfoRow label="Места">
            <span className="font-display font-bold text-[color:var(--brand-magenta)]">
              {booked}
            </span>{" "}
            / {row.capacity}
          </InfoRow>
          <InfoRow label="Депозит">{formatEurMinor(row.depositAmount)}</InfoRow>
          <InfoRow label="Студио">{row.studio.name}</InfoRow>
        </dl>

        {row.eventNotes && (
          <div className="mt-5 flex items-stretch overflow-hidden rounded-2xl border border-[color:var(--brand-pink)]/40 bg-[color:var(--brand-pink-soft)]">
            <span aria-hidden className="w-[3px] shrink-0 bg-[color:var(--brand-magenta)]" />
            <p className="px-4 py-3 text-[13px] leading-snug text-[color:var(--brand-purple)]">
              {row.eventNotes}
            </p>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="border-t border-[color:var(--brand-pink)]/40 bg-white px-5 py-4">
        {isCancelled ? (
          <div className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-ink)]/10 px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-ink)]/60">
            Отказано
          </div>
        ) : isPast ? (
          <div className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-pink-soft)]/60 px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
            Класът приключи
          </div>
        ) : isBooked ? (
          <div className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-50 px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-emerald-700">
            Записан ✓
          </div>
        ) : full ? (
          <div className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-pink-soft)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]/80">
            Класът е пълен
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onClose();
              onBook(row);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2"
          >
            {isAuthed ? "Запази място" : "Вход за записване"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/65">
        {label}
      </dt>
      <dd className="text-right text-[14px] text-[color:var(--brand-ink)]">{children}</dd>
    </div>
  );
}

function splitDay(formatted: string): { weekday: string; date: string } {
  const m = formatted.match(/^([^,]+),\s*(.+?)(?:\s*г\.?)?$/);
  if (!m) return { weekday: formatted, date: "" };
  return { weekday: m[1], date: m[2] };
}

function Close({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
