"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  partnerFormSchema,
  type PartnerFormInput,
} from "@/lib/validation/partnerForm";
import { upsertPartnerAction } from "@/app/admin/_actions";
import { ImageUpload } from "@/app/admin/_components/ImageUpload";

export type PartnerFormProps = {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    siteUrl: string | null;
    promoCode: string | null;
    active: boolean;
  };
};

const inputClass =
  "mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30";

export function PartnerForm({ mode, initialData }: PartnerFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PartnerFormInput>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues:
      mode === "edit" && initialData
        ? {
            id: initialData.id,
            name: initialData.name,
            description: initialData.description ?? "",
            logoUrl: initialData.logoUrl ?? "",
            siteUrl: initialData.siteUrl ?? "",
            promoCode: initialData.promoCode ?? "",
            active: initialData.active,
          }
        : {
            name: "",
            description: "",
            logoUrl: "",
            siteUrl: "",
            promoCode: "",
            active: true,
          },
    mode: "onChange",
  });

  const onSubmit = async (data: PartnerFormInput) => {
    setSubmitError(null);
    const result = await upsertPartnerAction(data);
    if (result.ok) {
      startTransition(() => {
        router.push(
          `/admin/partners?success=${mode === "create" ? "created" : "updated"}`,
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
          Име на бранда<span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="напр. YogaShop BG"
              maxLength={100}
              className={inputClass}
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
          Описание на отстъпката
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Опционално. Кратък ред под името, напр. „15% отстъпка с кода“.
        </p>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              value={field.value ?? ""}
              type="text"
              placeholder="15% отстъпка с кода"
              maxLength={200}
              className={inputClass}
              disabled={isPending}
            />
          )}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div>
        <Controller
          name="logoUrl"
          control={control}
          render={({ field }) => (
            <ImageUpload
              label="Лого"
              folder="partners"
              value={field.value ?? ""}
              onChange={field.onChange}
              disabled={isPending}
            />
          )}
        />
        {errors.logoUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.logoUrl.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Сайт (URL)
        </label>
        <Controller
          name="siteUrl"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              value={field.value ?? ""}
              type="url"
              placeholder="https://partner-site.bg"
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          )}
        />
        {errors.siteUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.siteUrl.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Промо код
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Поне едно от „Сайт“ или „Промо код“ е задължително.
        </p>
        <Controller
          name="promoCode"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              value={field.value ?? ""}
              type="text"
              placeholder="FITLAB15"
              maxLength={50}
              className={`${inputClass} font-mono uppercase`}
              disabled={isPending}
            />
          )}
        />
        {errors.promoCode && (
          <p className="mt-1 text-xs text-red-600">{errors.promoCode.message}</p>
        )}
      </div>

      <Controller
        name="active"
        control={control}
        render={({ field }) => (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-[color:var(--brand-pink-soft)]/40 px-3.5 py-3">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand-magenta)]"
            />
            <span className="text-sm text-[color:var(--brand-ink)]">
              <span className="font-semibold">Активен</span>
              <span className="block text-xs text-[color:var(--brand-purple)]/60">
                Показва се в „Лоялна програма“ на профила на клиентите.
              </span>
            </span>
          </label>
        )}
      />

      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Link
          href="/admin/partners"
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
