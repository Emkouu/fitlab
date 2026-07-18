"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addClientSchema,
  type AddClientInput,
} from "@/lib/validation/clientForm";
import { addClientAction } from "@/app/admin/_actions";

const inputClass =
  "mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30";

export function AddClientForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AddClientInput>({
    resolver: zodResolver(addClientSchema),
    defaultValues: { fullName: "", phone: "", email: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: AddClientInput) => {
    setSubmitError(null);
    const result = await addClientAction(data);
    if (result.ok) {
      startTransition(() => {
        router.push("/admin/clients?success=created");
      });
    } else {
      setSubmitError(result.message);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto w-full max-w-[440px] space-y-5 px-5 py-6"
    >
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Име<span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="fullName"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="Име и фамилия"
              maxLength={120}
              className={inputClass}
              disabled={isPending}
            />
          )}
        />
        {errors.fullName && (
          <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Телефон
        </label>
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              value={field.value ?? ""}
              type="tel"
              placeholder="+359 88 123 4567"
              maxLength={32}
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          )}
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Имейл
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Поне едно от „Телефон“ или „Имейл“ е задължително — по него клиентът
          се свързва с профила си при първия вход.
        </p>
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              value={field.value ?? ""}
              type="email"
              placeholder="client@example.com"
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          )}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Link
          href="/admin/clients"
          className="flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 text-center font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5"
        >
          Отказ
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Запазване..." : "Добави клиент"}
        </button>
      </div>
    </form>
  );
}
