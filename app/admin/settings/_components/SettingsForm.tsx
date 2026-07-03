"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  studioSettingsSchema,
  type StudioSettingsInput,
} from "@/lib/validation/studioSettingsForm";
import { updateStudioSettingsAction } from "@/app/admin/_actions";

export type SettingsFormProps = {
  initialData: StudioSettingsInput;
  /** Editing studio config is super_admin-only (see admin/_actions.ts). */
  canEdit: boolean;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30";

const labelClass =
  "block text-sm font-semibold text-[color:var(--brand-ink)]";

const helperClass = "mt-1 text-xs text-[color:var(--brand-purple)]/60";

export function SettingsForm({ initialData, canEdit }: SettingsFormProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudioSettingsInput>({
    resolver: zodResolver(studioSettingsSchema),
    defaultValues: initialData,
    mode: "onChange",
  });

  const onSubmit = async (data: StudioSettingsInput) => {
    if (!canEdit) return;
    setSubmitError(null);
    setToast(null);
    const result = await updateStudioSettingsAction(data);
    if (result.ok) {
      setToast(result.message);
      router.refresh();
      setTimeout(() => setToast(null), 3000);
    } else {
      setSubmitError(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* ─── Studio info ───────────────────────────────────────────── */}
      <section className="space-y-5">
        <h2 className="font-display text-base font-bold text-[color:var(--brand-purple)]">
          Информация за студиото
        </h2>

        <div>
          <label className={labelClass}>
            Име<span className="text-[color:var(--brand-magenta)]">*</span>
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input {...field} type="text" className={inputClass} disabled={isSubmitting} />
            )}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Адрес</label>
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="text"
                placeholder="ул. Патриарх Евтимий 7а, Варна 9000"
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.address && (
            <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Телефон</label>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="tel"
                placeholder="088 241 4863"
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Facebook URL</label>
          <Controller
            name="facebookUrl"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="url"
                placeholder="https://www.facebook.com/..."
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.facebookUrl && (
            <p className="mt-1 text-xs text-red-600">{errors.facebookUrl.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Instagram URL</label>
          <Controller
            name="instagramUrl"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="url"
                placeholder="https://www.instagram.com/..."
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.instagramUrl && (
            <p className="mt-1 text-xs text-red-600">{errors.instagramUrl.message}</p>
          )}
        </div>
      </section>

      <hr className="border-[color:var(--brand-purple)]/10" />

      {/* ─── Booking rules ──────────────────────────────────────────── */}
      <section className="space-y-5">
        <h2 className="font-display text-base font-bold text-[color:var(--brand-purple)]">
          Правила за записване
        </h2>

        <div>
          <label className={labelClass}>
            Прозорец за отказ (часове)
            <span className="text-[color:var(--brand-magenta)]">*</span>
          </label>
          <p className={helperClass}>
            Членовете могат да откажат до X часа преди клас. След това депозитът се удържа.
          </p>
          <Controller
            name="cancelWindowHours"
            control={control}
            render={({ field }) => (
              <input
                type="number"
                min={1}
                max={48}
                step={1}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.cancelWindowHours && (
            <p className="mt-1 text-xs text-red-600">
              {errors.cancelWindowHours.message}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>
            Депозит по подразбиране (EUR)
            <span className="text-[color:var(--brand-magenta)]">*</span>
          </label>
          <p className={helperClass}>
            Използва се като начална стойност при добавяне на нов клас.
          </p>
          <Controller
            name="defaultDepositEur"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="text"
                inputMode="decimal"
                placeholder="20.00"
                className={inputClass}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.defaultDepositEur && (
            <p className="mt-1 text-xs text-red-600">
              {errors.defaultDepositEur.message}
            </p>
          )}
        </div>
      </section>

      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg bg-[color:var(--brand-pink-soft)]/60 px-4 py-3 text-xs text-[color:var(--brand-purple)]/80">
          Само super admin може да променя настройките на студиото.
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !canEdit}
        className="w-full rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3 font-display font-semibold text-white shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)] transition-all hover:opacity-95 disabled:opacity-50"
      >
        {isSubmitting ? "Запазване..." : "Запази настройките"}
      </button>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[color:var(--brand-purple)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </form>
  );
}
