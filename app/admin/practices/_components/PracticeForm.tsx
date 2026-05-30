"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  practiceFormSchema,
  type PracticeFormInput,
} from "@/lib/validation/practiceForm";
import { generateSlug } from "@/lib/utils/slug";
import { upsertPracticeAction } from "@/app/admin/_actions";

export type PracticeFormProps = {
  mode: "create" | "edit";
  initialData?: { id: string; name: string; slug: string; description: string | null };
};

export function PracticeForm({ mode, initialData }: PracticeFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PracticeFormInput>({
    resolver: zodResolver(practiceFormSchema),
    defaultValues:
      mode === "edit" && initialData
        ? {
            id: initialData.id,
            name: initialData.name,
            slug: initialData.slug,
            description: initialData.description ?? "",
          }
        : { name: "", slug: "", description: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: PracticeFormInput) => {
    setSubmitError(null);
    const result = await upsertPracticeAction(data);
    if (result.ok) {
      startTransition(() => {
        router.push(
          `/admin/practices?success=${mode === "create" ? "created" : "updated"}`,
        );
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
          name="name"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="напр. Виняса Флоу"
              maxLength={100}
              onChange={(e) => {
                field.onChange(e);
                if (!slugTouched) {
                  setValue("slug", generateSlug(e.target.value), {
                    shouldValidate: true,
                  });
                }
              }}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isPending}
            />
          )}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Slug<span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Малки латински букви, цифри и тирета. Auto от името; може да се промени.
        </p>
        <Controller
          name="slug"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="vinyasa-flow"
              maxLength={100}
              onChange={(e) => {
                setSlugTouched(true);
                field.onChange(e);
              }}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-mono text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isPending}
            />
          )}
        />
        {errors.slug && (
          <p className="mt-1 text-xs text-red-600">{errors.slug.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Описание
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Опционално. Показва се на потребителите в инфо панела за класа.
        </p>
        <Controller
          name="description"
          control={control}
          render={({ field }) => {
            const value = field.value ?? "";
            return (
              <>
                <textarea
                  {...field}
                  value={value}
                  rows={5}
                  maxLength={1000}
                  placeholder="Опиши какво представлява тази практика, какво да очакват участниците, подходяща ли е за начинаещи и т.н."
                  className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
                  disabled={isPending}
                />
                <p className="mt-1 text-right text-[11px] text-[color:var(--brand-purple)]/55">
                  {value.length} / 1000
                </p>
              </>
            );
          }}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Link
          href="/admin/practices"
          className="flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 text-center font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5"
        >
          Отказ
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Запазване..." : "Запази"}
        </button>
      </div>
    </form>
  );
}
