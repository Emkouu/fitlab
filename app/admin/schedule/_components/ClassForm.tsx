"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  classFormSchema,
  type ClassFormInput,
} from "@/lib/validation/classForm";
import { tomorrowSofiaDate, todaySofiaDateKey } from "@/lib/format/sofiaTime";
import { sofiaDateKey } from "@/lib/format";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

// Duration options (in minutes)
const DURATION_OPTIONS = ["45", "55", "60", "70", "80", "90", "100", "120"];

export type ClassFormProps = {
  mode: "create" | "edit";
  practices: Array<{ id: string; name: string }>;
  trainers: Array<{ id: string; name: string }>;
  initialData?: ClassFormInput & { id: string };
  /** Pre-fill deposit (EUR string, e.g. "20.00") for create mode. Defaults to "20.00". */
  defaultDepositEur?: string;
  onSubmit: (data: ClassFormInput) => Promise<void | { error: string }>;
  isLoading?: boolean;
};

/**
 * Helper: Convert YYYY-MM-DD input to a Date at midnight UTC.
 * Matches the canonical shape stored in the form's `date` field.
 */
function inputFormatToDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function ClassForm({
  mode,
  practices,
  trainers,
  initialData,
  defaultDepositEur = "20.00",
  onSubmit: onSubmitProp,
  isLoading = false,
}: ClassFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate default date (tomorrow in Sofia)
  const defaultDateStr = sofiaDateKey(tomorrowSofiaDate());

  // Prepare initial values based on mode
  const getDefaultValues = (): ClassFormInput => {
    if (mode === "create") {
      return {
        date: inputFormatToDate(defaultDateStr),
        time: "18:00",
        duration: "60",
        practiceId: "",
        trainerIds: [],
        capacity: 15,
        depositEur: defaultDepositEur,
        isSpecialEvent: false,
        eventNotes: undefined,
      };
    }

    // Edit mode
    if (!initialData) {
      throw new Error("initialData is required for edit mode");
    }

    return {
      classId: initialData.id,
      date: initialData.date,
      time: initialData.time,
      duration: initialData.duration,
      practiceId: initialData.practiceId,
      trainerIds: initialData.trainerIds,
      capacity: initialData.capacity,
      depositEur: initialData.depositEur,
      isSpecialEvent: initialData.isSpecialEvent,
      eventNotes: initialData.eventNotes,
    };
  };

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  }: any = useForm({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      ...getDefaultValues(),
      isSpecialEvent: false,
    },
    mode: "onChange",
  });

  const watchIsSpecialEvent = watch("isSpecialEvent");
  const watchTrainerIds = watch("trainerIds");

  const handleOnSubmit = async (data: ClassFormInput) => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await onSubmitProp(data);
      if (result && "error" in result) {
        setSubmitError(result.error);
      } else {
        // Success - redirect back to schedule
        router.push("/admin/schedule");
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push("/admin/schedule");
  };

  return (
    <form
      onSubmit={handleSubmit(handleOnSubmit)}
      className="mx-auto w-full max-w-[440px] space-y-5 px-5 py-6"
    >
      {/* Date Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Дата
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => {
            const [ty, tm, td] = todaySofiaDateKey().split("-").map(Number);
            const todayLocal = new Date(ty, tm - 1, td);
            return (
              <div className="fl-calendar mt-2 w-full rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
                <DayPicker
                  mode="single"
                  required
                  selected={field.value}
                  onSelect={(d) => d && field.onChange(inputFormatToDate(sofiaDateKey(d)))}
                  disabled={{ before: todayLocal }}
                  weekStartsOn={1}
                  showOutsideDays
                />
              </div>
            );
          }}
        />
        {errors.date && (
          <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>
        )}
      </div>

      {/* Time Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Час
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="time"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="time"
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            />
          )}
        />
        {errors.time && (
          <p className="mt-1 text-xs text-red-600">{errors.time.message}</p>
        )}
      </div>

      {/* Duration Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Продължителност (мин)
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="duration"
          control={control}
          render={({ field }) => (
            <select
              {...field}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            >
              <option value="">Избери продължителност</option>
              {DURATION_OPTIONS.map((dur) => (
                <option key={dur} value={dur}>
                  {dur} мин
                </option>
              ))}
            </select>
          )}
        />
        {errors.duration && (
          <p className="mt-1 text-xs text-red-600">{errors.duration.message}</p>
        )}
      </div>

      {/* Practice Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Практика
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="practiceId"
          control={control}
          render={({ field }) => (
            <select
              {...field}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            >
              <option value="">Избери практика</option>
              {practices.map((practice) => (
                <option key={practice.id} value={practice.id}>
                  {practice.name}
                </option>
              ))}
            </select>
          )}
        />
        {errors.practiceId && (
          <p className="mt-1 text-xs text-red-600">
            {errors.practiceId.message}
          </p>
        )}
      </div>

      {/* Trainers Field (Multi-select with checkboxes) */}
      <div>
        <div className="flex items-center gap-2">
          <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
            Треньори
            <span className="text-[color:var(--brand-magenta)]">*</span>
          </label>
          <span className="inline-flex items-center rounded-full bg-[color:var(--brand-purple)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--brand-purple)]">
            {watchTrainerIds.length}/2
          </span>
        </div>
        <Controller
          name="trainerIds"
          control={control}
          render={({ field }) => (
            <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--brand-purple)]/20 p-3">
              {trainers.length === 0 ? (
                <p className="text-xs text-[color:var(--brand-purple)]/60">
                  Няма налични треньори
                </p>
              ) : (
                trainers.map((trainer) => (
                  <label
                    key={trainer.id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={field.value.includes(trainer.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (field.value.length < 2) {
                            field.onChange([...field.value, trainer.id]);
                          }
                        } else {
                          field.onChange(
                            field.value.filter((id: string) => id !== trainer.id)
                          );
                        }
                      }}
                      disabled={
                        isSubmitting ||
                        isLoading ||
                        (field.value.length >= 2 &&
                          !field.value.includes(trainer.id))
                      }
                      className="h-4 w-4 rounded border-[color:var(--brand-purple)]/30 accent-[color:var(--brand-magenta)]"
                    />
                    <span className="text-sm text-[color:var(--brand-ink)]">
                      {trainer.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        />
        {errors.trainerIds && (
          <p className="mt-1 text-xs text-red-600">
            {errors.trainerIds.message}
          </p>
        )}
      </div>

      {/* Capacity Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Капацитет (места)
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Минимум: 1, Максимум: 30
        </p>
        <Controller
          name="capacity"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="number"
              min="1"
              max="50"
              value={field.value}
              onChange={(e) => field.onChange(Number(e.target.value))}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            />
          )}
        />
        {errors.capacity && (
          <p className="mt-1 text-xs text-red-600">{errors.capacity.message}</p>
        )}
      </div>

      {/* Deposit Amount Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Депозит
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <div className="mt-2 flex items-center rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 transition-all focus-within:border-[color:var(--brand-magenta)] focus-within:ring-1 focus-within:ring-[color:var(--brand-magenta)]/30">
          <Controller
            name="depositEur"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="text"
                inputMode="decimal"
                placeholder="20.00"
                className="w-full text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 outline-none"
                disabled={isSubmitting || isLoading}
              />
            )}
          />
          <span className="ml-2 text-sm font-semibold text-[color:var(--brand-purple)]">
            €
          </span>
        </div>
        {errors.depositEur && (
          <p className="mt-1 text-xs text-red-600">
            {errors.depositEur.message}
          </p>
        )}
      </div>

      {/* Special Event Checkbox */}
      <div>
        <label className="flex cursor-pointer items-center gap-3">
          <Controller
            name="isSpecialEvent"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="checkbox"
                checked={field.value}
                className="h-4 w-4 rounded border-[color:var(--brand-purple)]/30 accent-[color:var(--brand-magenta)]"
                disabled={isSubmitting || isLoading}
              />
            )}
          />
          <span className="text-sm font-semibold text-[color:var(--brand-ink)]">
            Специално събитие
          </span>
        </label>
      </div>

      {/* Event Notes Textarea (only shown if Special Event is checked) */}
      {watchIsSpecialEvent && (
        <div>
          <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
            Бележки
          </label>
          <Controller
            name="eventNotes"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                placeholder="Доп. информация..."
                className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
                rows={3}
                disabled={isSubmitting || isLoading}
              />
            )}
          />
          {errors.eventNotes && (
            <p className="mt-1 text-xs text-red-600">
              {errors.eventNotes.message}
            </p>
          )}
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting || isLoading}
          className="flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5 disabled:opacity-50"
        >
          Отказ
        </button>
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="flex-1 rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting || isLoading ? "Запазване..." : "Запази"}
        </button>
      </div>
    </form>
  );
}
