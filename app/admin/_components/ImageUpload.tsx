"use client";

import { useRef, useState, useTransition } from "react";
import { uploadImageAction } from "@/app/admin/_actions";

/**
 * Reusable image upload control. Uploads the chosen file to Supabase Storage
 * via `uploadImageAction` and reports the resulting public URL back through
 * `onChange`. The parent form still stores a URL string — the user just picks
 * a file instead of pasting a link.
 */
export function ImageUpload({
  value,
  onChange,
  folder,
  label = "Снимка",
  disabled = false,
}: {
  /** Current image URL (or empty/null). */
  value: string | null | undefined;
  /** Called with the new public URL after a successful upload, or "" on remove. */
  onChange: (url: string) => void;
  /** Storage sub-folder, e.g. "trainers" | "events" | "partners". */
  folder: string;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);

    startTransition(async () => {
      const r = await uploadImageAction(fd);
      if (r.ok) {
        onChange(r.url);
      } else {
        setError(r.message);
      }
      // Reset the input so re-selecting the same file re-triggers change.
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <span className="block text-sm font-semibold text-[color:var(--brand-ink)]">
        {label}
      </span>

      <div className="mt-2 flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Преглед"
            className="h-16 w-16 shrink-0 rounded-xl border border-[color:var(--brand-pink)]/40 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-[color:var(--brand-pink)]/50 text-[color:var(--brand-purple)]/40">
            <ImageIcon />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || pending}
            className="rounded-xl bg-[color:var(--brand-magenta)] px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
          >
            {pending ? "Качване…" : value ? "Смени снимката" : "Качи снимка"}
          </button>
          {value && !pending && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={disabled}
              className="rounded-xl border border-[color:var(--brand-pink)]/60 px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-60"
            >
              Премахни
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
        disabled={disabled || pending}
      />

      <p className="mt-1 text-xs text-[color:var(--brand-purple)]/55">
        JPG, PNG или WEBP · до 5 MB.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
