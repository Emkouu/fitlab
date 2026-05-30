"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboardingForm";
import { completeOnboardingAction } from "../_actions";

export function OnboardingForm({
  next,
  initialPhone,
}: {
  next: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { fullName: "", phone: initialPhone },
  });

  async function onSubmit(values: OnboardingInput) {
    setServerError(null);
    const res = await completeOnboardingAction(values);
    if (!res.ok) {
      setServerError(res.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <label className="block">
        <span className="block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
          Пълно име
        </span>
        <input
          type="text"
          autoComplete="name"
          placeholder="Иван Иванов"
          disabled={isSubmitting}
          {...register("fullName")}
          className="mt-1.5 block w-full rounded-2xl border border-[color:var(--brand-pink)]/60 bg-white px-4 py-3 text-base text-[color:var(--brand-ink)] placeholder:text-[color:var(--brand-purple)]/35 focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60"
        />
        {errors.fullName && (
          <p role="alert" className="mt-1.5 text-sm text-[color:var(--brand-magenta)]">
            Името трябва да е поне 2 символа.
          </p>
        )}
      </label>

      <label className="block">
        <span className="block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
          Телефон
        </span>
        <input
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="088 888 8888"
          disabled={isSubmitting}
          {...register("phone")}
          className="mt-1.5 block w-full rounded-2xl border border-[color:var(--brand-pink)]/60 bg-white px-4 py-3 text-base text-[color:var(--brand-ink)] placeholder:text-[color:var(--brand-purple)]/35 focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-magenta)]/30 disabled:opacity-60"
        />
        {errors.phone && (
          <p role="alert" className="mt-1.5 text-sm text-[color:var(--brand-magenta)]">
            Въведи валиден телефон.
          </p>
        )}
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:bg-[color:var(--brand-magenta)]"
      >
        {isSubmitting ? "Запазване…" : "Продължи →"}
      </button>

      {serverError && (
        <p role="alert" className="text-sm text-[color:var(--brand-magenta)]">
          {serverError}
        </p>
      )}
    </form>
  );
}
