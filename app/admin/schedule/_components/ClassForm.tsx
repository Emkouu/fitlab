"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  classFormSchema,
  type ClassFormInput,
} from "@/lib/validation/classForm";
import { tomorrowSofiaDate, todaySofiaDateKey } from "@/lib/format/sofiaTime";
import { sofiaDateKey } from "@/lib/format";
import { generateRecurringDates } from "@/lib/schedule/generateRecurringDates";
import { ImageUpload } from "@/app/admin/_components/ImageUpload";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

const WEEKDAY_LABELS = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"];
const MAX_RECURRENCE = 50;

/** Last day of the Sofia month for a given Date (used as default end date). */
function endOfMonthKey(d: Date): string {
  const key = sofiaDateKey(d);
  const [y, m] = key.split("-").map(Number);
  // Day 0 of next month = last day of this month
  const last = new Date(Date.UTC(y, m, 0));
  const yy = last.getUTCFullYear();
  const mm = String(last.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(last.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatBgDate(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

function bgWeekdayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_LABELS[(dt.getUTCDay() + 6) % 7].toLowerCase();
}

// Duration options (in minutes)
const DURATION_OPTIONS = ["45", "55", "60", "70", "80", "90", "100", "120"];

export type ClassFormProps = {
  mode: "create" | "edit";
  practices: Array<{ id: string; name: string }>;
  trainers: Array<{ id: string; name: string }>;
  initialData?: ClassFormInput & { id: string };
  /** `Studio.defaultDeposit` as an EUR string, shown as the placeholder so the
   *  admin can see what an empty (inherited) field will actually charge. */
  studioDepositEur?: string;
  onSubmit: (
    data: ClassFormInput,
    action: "save_and_close" | "save_and_add",
  ) => Promise<void | { error: string } | { stay: boolean }>;
  isLoading?: boolean;
  successToast?: string | null;
  onClearToast?: () => void;
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
  studioDepositEur,
  onSubmit: onSubmitProp,
  isLoading = false,
  successToast = null,
  onClearToast,
}: ClassFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>([]);
  const [recurEndDate, setRecurEndDate] = useState<string>(() =>
    endOfMonthKey(tomorrowSofiaDate()),
  );
  // Tracks which button initiated submit so handleSubmit knows what to do.
  const [pendingAction, setPendingAction] = useState<
    "save_and_close" | "save_and_add"
  >("save_and_close");

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
        depositEur: "",
        isSpecialEvent: false,
        eventNotes: undefined,
        imageUrl: "",
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
      imageUrl: initialData.imageUrl ?? "",
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
  const watchDate = watch("date");

  const recurringDates = useMemo(() => {
    if (!recurEnabled || recurWeekdays.length === 0 || !watchDate) return [];
    return generateRecurringDates(
      sofiaDateKey(watchDate),
      recurEndDate,
      recurWeekdays,
    );
  }, [recurEnabled, recurWeekdays, recurEndDate, watchDate]);

  // Auto-clear toast after a few seconds
  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => onClearToast?.(), 4000);
    return () => clearTimeout(t);
  }, [successToast, onClearToast]);

  const handleOnSubmit = async (data: ClassFormInput) => {
    setSubmitError(null);
    setIsSubmitting(true);

    const payload: ClassFormInput = { ...data };
    if (mode === "create" && recurEnabled) {
      if (recurWeekdays.length === 0) {
        setSubmitError("Избери поне един ден от седмицата.");
        setIsSubmitting(false);
        return;
      }
      payload.recurrence = {
        weekdays: recurWeekdays,
        endDate: recurEndDate,
      };
    }

    try {
      const result = await onSubmitProp(payload, pendingAction);
      if (result && "error" in result) {
        setSubmitError(result.error);
      } else if (result && "stay" in result && result.stay) {
        // Reset date + time only, keep practice/trainer/duration/capacity/deposit.
        const nextDateStr = sofiaDateKey(tomorrowSofiaDate());
        reset({
          ...data,
          recurrence: undefined,
          date: new Date(`${nextDateStr}T00:00:00Z`),
          time: "",
        });
        setRecurEnabled(false);
        setRecurWeekdays([]);
        // Focus the time input (date picker is hard to focus programmatically)
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>(
            'input[type="time"]',
          );
          el?.focus();
        }, 0);
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
        </label>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--brand-purple)]/65">
          Остави празно, за да важи сумата от Настройки
          {studioDepositEur ? ` (${studioDepositEur} €)` : ""}. Попълни само ако
          този клас трябва да е с различен депозит.
        </p>
        <div className="mt-2 flex items-center rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 transition-all focus-within:border-[color:var(--brand-magenta)] focus-within:ring-1 focus-within:ring-[color:var(--brand-magenta)]/30">
          <Controller
            name="depositEur"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="text"
                inputMode="decimal"
                placeholder={studioDepositEur ?? "10.00"}
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

      {/* Recurrence (create mode only) */}
      {mode === "create" && (
        <div className="rounded-lg border border-[color:var(--brand-purple)]/20 p-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={recurEnabled}
              onChange={(e) => setRecurEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-[color:var(--brand-purple)]/30 accent-[color:var(--brand-magenta)]"
              disabled={isSubmitting || isLoading}
            />
            <span className="text-sm font-semibold text-[color:var(--brand-ink)]">
              🔁 Повтаря се
            </span>
          </label>

          {recurEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[color:var(--brand-ink)]">
                  Повтаря се в дните
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, idx) => {
                    const checked = recurWeekdays.includes(idx);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setRecurWeekdays((prev) =>
                            prev.includes(idx)
                              ? prev.filter((w) => w !== idx)
                              : [...prev, idx].sort((a, b) => a - b),
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                          checked
                            ? "border-[color:var(--brand-magenta)] bg-[color:var(--brand-magenta)] text-white"
                            : "border-[color:var(--brand-purple)]/30 text-[color:var(--brand-purple)] hover:bg-[color:var(--brand-purple)]/5"
                        }`}
                        disabled={isSubmitting || isLoading}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--brand-ink)]">
                  До дата
                </label>
                <input
                  type="date"
                  value={recurEndDate}
                  onChange={(e) => setRecurEndDate(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2 text-sm font-medium text-[color:var(--brand-ink)] focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
                  disabled={isSubmitting || isLoading}
                />
              </div>

              <div className="text-xs text-[color:var(--brand-purple)]">
                {recurringDates.length === 0 ? (
                  <span>Избери поне един ден.</span>
                ) : (
                  <>
                    Ще бъдат създадени{" "}
                    <strong>{recurringDates.length}</strong> класа
                    {recurringDates.length > MAX_RECURRENCE && (
                      <span className="ml-1 text-red-600">
                        (макс. {MAX_RECURRENCE})
                      </span>
                    )}
                  </>
                )}
              </div>

              {recurringDates.length > 0 && (
                <ul className="space-y-0.5 text-xs text-[color:var(--brand-purple)]/80">
                  {recurringDates.slice(0, 5).map((key) => (
                    <li key={key}>
                      {bgWeekdayShort(key)}, {formatBgDate(key)}
                    </li>
                  ))}
                  {recurringDates.length > 5 && (
                    <li>...и още {recurringDates.length - 5}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

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

          <div className="mt-4">
            <Controller
              name="imageUrl"
              control={control}
              render={({ field }) => (
                <ImageUpload
                  label="Снимка на събитието"
                  folder="events"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  disabled={isSubmitting || isLoading}
                />
              )}
            />
            {errors.imageUrl && (
              <p className="mt-1 text-xs text-red-600">
                {errors.imageUrl.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">
          {successToast}
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-4">
        {mode === "create" && (
          <div className="flex gap-3">
            <button
              type="submit"
              onClick={() => setPendingAction("save_and_add")}
              disabled={isSubmitting || isLoading}
              className="flex-1 rounded-lg border-2 border-[color:var(--brand-magenta)] bg-white px-4 py-2.5 font-semibold text-[color:var(--brand-magenta)] transition-all hover:bg-[color:var(--brand-magenta)]/5 disabled:opacity-50"
            >
              {isSubmitting || isLoading ? "Запазване..." : "Запази и добави още"}
            </button>
            <button
              type="submit"
              onClick={() => setPendingAction("save_and_close")}
              disabled={isSubmitting || isLoading}
              className="flex-1 rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting || isLoading ? "Запазване..." : "Запази и затвори"}
            </button>
          </div>
        )}
        {mode === "edit" && (
          <button
            type="submit"
            onClick={() => setPendingAction("save_and_close")}
            disabled={isSubmitting || isLoading}
            className="w-full rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting || isLoading ? "Запазване..." : "Запази"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting || isLoading}
          className="w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5 disabled:opacity-50"
        >
          Отказ
        </button>
      </div>
    </form>
  );
}
