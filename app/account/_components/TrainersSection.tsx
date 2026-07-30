"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export type TrainerCardRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  specialties: { id: string; name: string }[];
};

/**
 * Client-facing trainers directory: photo, name, a short bio and the
 * practices each trainer specialises in. Tapping a card opens a modal with a
 * larger photo and the full bio. Read-only — the admin panel
 * (`/admin/trainers`) is the source of truth for this content.
 *
 * Uploaded photos live on Supabase Storage; we render them with a plain
 * `<img>` (matching PartnerPerks / events) because there is no
 * `images.remotePatterns` config for `next/image`.
 */
export function TrainersSection({ trainers }: { trainers: TrainerCardRow[] }) {
  const [selected, setSelected] = useState<TrainerCardRow | null>(null);

  if (trainers.length === 0) return null;

  return (
    <>
      <ul className="space-y-3">
        {trainers.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setSelected(t)}
              className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-colors hover:bg-[color:var(--brand-pink-soft)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)]"
            >
              <Avatar
                name={t.name}
                photoUrl={t.photoUrl}
                className="h-16 w-16 text-xl"
              />

              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold tracking-tight text-[color:var(--brand-ink)]">
                  {t.name}
                </p>

                {t.specialties.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.specialties.map((s) => (
                      <span
                        key={s.id}
                        className="rounded-full bg-[color:var(--brand-pink-soft)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-purple)]"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}

                {t.bio && (
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/75">
                    {t.bio}
                  </p>
                )}
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 self-center text-[color:var(--brand-purple)]/35" />
            </button>
          </li>
        ))}
      </ul>

      <TrainerModal trainer={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function TrainerModal({
  trainer,
  onClose,
}: {
  trainer: TrainerCardRow | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (trainer && !d.open) d.showModal();
    else if (!trainer && d.open) d.close();
  }, [trainer]);

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
    if (e.target === dialogRef.current) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="trainer-modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[400px] rounded-3xl border-none bg-white p-0 text-[color:var(--brand-ink)] shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] backdrop:bg-[rgba(42,14,46,0.55)] backdrop:backdrop-blur-sm"
    >
      {trainer && (
        <TrainerModalBody
          trainer={trainer}
          onClose={() => dialogRef.current?.close()}
        />
      )}
    </dialog>
  );
}

function TrainerModalBody({
  trainer,
  onClose,
}: {
  trainer: TrainerCardRow;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="font-sans"
    >
      {/* Close button pinned top-right over the header area. */}
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[color:var(--brand-purple)]/70 backdrop-blur-sm transition-colors hover:bg-white hover:text-[color:var(--brand-magenta)]"
        >
          <Close className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-8 pb-5">
          <Avatar
            name={trainer.name}
            photoUrl={trainer.photoUrl}
            className="h-32 w-32 text-4xl"
          />
          <h2
            id="trainer-modal-title"
            className="mt-4 text-center font-display text-xl font-bold tracking-tight text-[color:var(--brand-ink)]"
          >
            {trainer.name}
          </h2>

          {trainer.specialties.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {trainer.specialties.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--brand-purple)]"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {trainer.bio && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-[color:var(--brand-pink)]/40 px-6 py-5">
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-[color:var(--brand-purple)]/85">
            {trainer.bio}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function Avatar({
  name,
  photoUrl,
  className = "",
}: {
  name: string;
  photoUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-[color:var(--brand-pink-soft)] ring-1 ring-[color:var(--brand-pink)]/40 ${className}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-display font-bold text-[color:var(--brand-magenta)]">
          {initials(name)}
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function Close({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
