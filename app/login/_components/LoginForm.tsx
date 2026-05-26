"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/schedule";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setErrMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Supabase will append #access_token, but our server callback uses ?code=...
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      setStatus("error");
      setErrMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-7 text-center"
      >
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--brand-pink-soft)]">
          <Mail className="h-5 w-5 text-[color:var(--brand-magenta)]" />
        </div>
        <h2 className="font-display text-base font-bold">Провери си имейла</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/75">
          Изпратихме връзка за вход на <span className="font-semibold">{email}</span>.
          Отвори имейла от телефона, на който искаш да влезеш.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setErrMsg(null);
          }}
          className="mt-5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] underline-offset-4 hover:underline"
        >
          Промени имейла
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
          Имейл
        </span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="ti@example.com"
          disabled={status === "sending"}
          className="mt-1.5 block w-full rounded-2xl border border-[color:var(--brand-pink)]/60 bg-white px-4 py-3 text-base text-[color:var(--brand-ink)] placeholder:text-[color:var(--brand-purple)]/35 focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={status === "sending" || !email.trim()}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:bg-[color:var(--brand-magenta)]"
      >
        {status === "sending" ? "Изпращане…" : "Изпрати връзка"}
      </button>

      {status === "error" && errMsg && (
        <p role="alert" className="text-sm text-[color:var(--brand-magenta)]">
          {errMsg}
        </p>
      )}

      <p className="pt-2 text-center text-[11px] leading-relaxed text-[color:var(--brand-purple)]/55">
        Скоро ще можеш да влезеш и с SMS код на телефона си.
      </p>
    </form>
  );
}

function Mail({ className = "" }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
