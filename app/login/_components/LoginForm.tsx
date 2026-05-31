"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Step = "email" | "code";
type Status = "idle" | "sending" | "verifying" | "error";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") ?? "/schedule";
  const next = rawNext.startsWith("/") ? rawNext : "/schedule";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode(targetEmail: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: true },
    });
    return error;
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setErrMsg(null);
    const error = await sendCode(trimmed);
    if (error) {
      setStatus("error");
      setErrMsg(error.message);
      return;
    }
    setStatus("idle");
    setStep("code");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setErrMsg(null);
    const error = await sendCode(email);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setCode(["", "", "", "", "", ""]);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function verifyCode(fullCode: string) {
    if (fullCode.length !== 6) return;
    setStatus("verifying");
    setErrMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: fullCode,
      type: "email",
    });
    if (error || !data.session) {
      setStatus("error");
      setErrMsg("Невалиден или изтекъл код. Опитай отново.");
      setCode(["", "", "", "", "", ""]);
      return;
    }
    try {
      const res = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ next }),
      });
      if (!res.ok) {
        setStatus("error");
        setErrMsg("Възникна грешка. Опитай отново.");
        return;
      }
      const payload = (await res.json()) as { redirect: string };
      router.replace(payload.redirect);
    } catch {
      setStatus("error");
      setErrMsg("Възникна грешка. Опитай отново.");
    }
  }

  if (step === "code") {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="font-display text-base font-bold text-[color:var(--brand-ink)]">
            Провери имейла си
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/75">
            Изпратихме 6-цифрен код на{" "}
            <span className="font-semibold">{email}</span>. Въведи го по-долу.
          </p>
        </div>

        <OtpInput
          value={code}
          onChange={setCode}
          disabled={status === "verifying"}
          onComplete={(full) => void verifyCode(full)}
        />

        <button
          type="button"
          disabled={status === "verifying" || code.join("").length !== 6}
          onClick={() => void verifyCode(code.join(""))}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:bg-[color:var(--brand-magenta)]"
        >
          {status === "verifying" ? "Проверка…" : "Влез"}
        </button>

        {errMsg && (
          <p role="alert" className="text-center text-sm text-[color:var(--brand-magenta)]">
            {errMsg}
          </p>
        )}

        <div className="flex flex-col items-center gap-2 pt-2 text-center text-[11px] leading-relaxed text-[color:var(--brand-purple)]/65">
          <span>Не получи код?</span>
          {cooldown > 0 ? (
            <span className="font-display font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/40">
              Изпрати отново след {cooldown} сек
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleResend()}
              className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] underline-offset-4 hover:underline"
            >
              Изпрати отново
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode(["", "", "", "", "", ""]);
              setErrMsg(null);
              setStatus("idle");
            }}
            className="mt-1 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60 underline-offset-4 hover:underline"
          >
            Промени имейла
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="space-y-4">
      <p className="text-sm leading-relaxed text-[color:var(--brand-purple)]/75">
        Въведи имейла си, за да получиш код.
      </p>
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
        {status === "sending" ? "Изпращане…" : "Изпрати код"}
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

function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onComplete: (full: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setDigit(i: number, digit: string) {
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
    const joined = next.join("");
    if (joined.length === 6 && !next.includes("")) onComplete(joined);
  }

  function handleChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length <= 1) {
      setDigit(i, digits);
      return;
    }
    // Multiple digits pasted into a single box — distribute.
    const next = [...value];
    for (let j = 0; j < digits.length && i + j < 6; j++) {
      next[i + j] = digits[j];
    }
    onChange(next);
    const focusIdx = Math.min(5, i + digits.length);
    refs.current[focusIdx]?.focus();
    const joined = next.join("");
    if (joined.length === 6 && !next.includes("")) onComplete(joined);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
      const next = [...value];
      next[i - 1] = "";
      onChange(next);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let j = 0; j < text.length; j++) next[j] = text[j];
    onChange(next);
    const focusIdx = Math.min(5, text.length);
    refs.current[focusIdx]?.focus();
    if (text.length === 6) onComplete(text);
  }

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          aria-label={`Цифра ${i + 1}`}
          className={`h-14 w-12 rounded-xl border-2 bg-white text-center font-display text-2xl font-bold text-[color:var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60 ${
            digit
              ? "border-[color:var(--brand-magenta)]"
              : "border-[color:var(--brand-pink)]/60"
          }`}
        />
      ))}
    </div>
  );
}
