"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  /** Optional rich body — overrides `message` when provided. */
  children?: ReactNode;
  /** Plain-text body shown when `children` is not provided. */
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** When true, the confirm button uses a destructive red tone. */
  destructive?: boolean;
  isPending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function AdminConfirmModal({
  open,
  title,
  children,
  message,
  confirmLabel,
  cancelLabel = "Отказ",
  destructive = false,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: AdminConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const handleClose = () => onClose();
    d.addEventListener("cancel", handleClose);
    d.addEventListener("close", handleClose);
    return () => {
      d.removeEventListener("cancel", handleClose);
      d.removeEventListener("close", handleClose);
    };
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !isPending) {
      dialogRef.current?.close();
    }
  }

  const confirmTone = destructive
    ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
    : "bg-[color:var(--brand-magenta)] hover:bg-[color:var(--brand-purple)] focus-visible:ring-[color:var(--brand-magenta)]";

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="admin-confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[24rem] rounded-3xl border-none bg-white p-0 text-[color:var(--brand-ink)] shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] backdrop:bg-[rgba(42,14,46,0.55)] backdrop:backdrop-blur-sm"
    >
      <div className="font-sans px-6 py-6">
        <h2
          id="admin-confirm-title"
          className="font-display text-lg font-bold tracking-tight"
        >
          {title}
        </h2>

        {children ? (
          children
        ) : message ? (
          <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
            {message}
          </p>
        ) : null}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl bg-[color:var(--brand-pink-soft)] px-4 py-3 text-[13px] text-[color:var(--brand-magenta)]"
          >
            {error}
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex min-h-12 w-full items-center justify-center rounded-2xl px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${confirmTone}`}
          >
            {isPending ? "Моля изчакай…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={isPending}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-[color:var(--brand-purple)]/20 bg-white px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
