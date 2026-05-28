"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  trainerFormSchema,
  type TrainerFormInput,
} from "@/lib/validation/trainerForm";
import Link from "next/link";

export type TrainerFormProps = {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    photoUrl: string | null;
    bio: string | null;
    specialties: Array<{ id: string; name: string }>;
    linkedUserId: string | null;
  };
  practices: Array<{ id: string; name: string }>;
  availableUsers: Array<{ id: string; email: string }>;
  onSubmit: (data: TrainerFormInput) => Promise<void | { error: string }>;
  isLoading?: boolean;
};

/**
 * TrainerForm component: Server-renderable form for creating/editing trainers.
 * Handles all form fields and validation using React Hook Form + Zod.
 */
export function TrainerForm({
  mode,
  initialData,
  practices,
  availableUsers,
  onSubmit: onSubmitProp,
  isLoading = false,
}: TrainerFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prepare initial values based on mode
  const getDefaultValues = (): TrainerFormInput => {
    if (mode === "create") {
      return {
        name: "",
        photoUrl: "",
        bio: "",
        specialtyIds: [],
        linkedUserId: null,
      };
    }

    // Edit mode
    if (!initialData) {
      throw new Error("initialData is required for edit mode");
    }

    return {
      trainerId: initialData.id,
      name: initialData.name,
      photoUrl: initialData.photoUrl || "",
      bio: initialData.bio || "",
      specialtyIds: initialData.specialties.map((s) => s.id),
      linkedUserId: initialData.linkedUserId,
    };
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TrainerFormInput>({
    resolver: zodResolver(trainerFormSchema),
    defaultValues: getDefaultValues(),
    mode: "onChange",
  });

  const handleOnSubmit = async (data: TrainerFormInput) => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await onSubmitProp(data);
      if (result && "error" in result) {
        setSubmitError(result.error);
      }
      // Success is handled by the wrapper component
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(handleOnSubmit)}
      className="mx-auto w-full max-w-[440px] space-y-5 px-5 py-6"
    >
      {/* Name Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Име
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="Въведи име на треньор"
              maxLength={100}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            />
          )}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Photo URL Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          URL на снимка
        </label>
        <Controller
          name="photoUrl"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="url"
              placeholder="https://example.com/photo.jpg"
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            />
          )}
        />
        {errors.photoUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.photoUrl.message}</p>
        )}
      </div>

      {/* Bio Field */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Биография
        </label>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/60">
          Максимум: 300 символа
        </p>
        <Controller
          name="bio"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              placeholder="Доп. информация за треньора..."
              maxLength={300}
              rows={4}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            />
          )}
        />
        {errors.bio && (
          <p className="mt-1 text-xs text-red-600">{errors.bio.message}</p>
        )}
      </div>

      {/* Specialties (Multi-select with checkboxes) */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Специалности
          <span className="text-[color:var(--brand-magenta)]">*</span>
        </label>
        <Controller
          name="specialtyIds"
          control={control}
          render={({ field }) => (
            <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--brand-purple)]/20 p-3">
              {practices.length === 0 ? (
                <p className="text-xs text-[color:var(--brand-purple)]/60">
                  Няма налични практики
                </p>
              ) : (
                practices.map((practice) => (
                  <label
                    key={practice.id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={field.value.includes(practice.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...field.value, practice.id]);
                        } else {
                          field.onChange(
                            field.value.filter((id: string) => id !== practice.id)
                          );
                        }
                      }}
                      disabled={isSubmitting || isLoading}
                      className="h-4 w-4 rounded border-[color:var(--brand-purple)]/30 accent-[color:var(--brand-magenta)]"
                    />
                    <span className="text-sm text-[color:var(--brand-ink)]">
                      {practice.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        />
        {errors.specialtyIds && (
          <p className="mt-1 text-xs text-red-600">
            {errors.specialtyIds.message}
          </p>
        )}
      </div>

      {/* Link to User Dropdown */}
      <div>
        <label className="block text-sm font-semibold text-[color:var(--brand-ink)]">
          Свързан потребител
        </label>
        <Controller
          name="linkedUserId"
          control={control}
          render={({ field }) => (
            <select
              {...field}
              value={field.value || ""}
              className="mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
              disabled={isSubmitting || isLoading}
            >
              <option value="">None</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          )}
        />
        {errors.linkedUserId && (
          <p className="mt-1 text-xs text-red-600">
            {errors.linkedUserId.message}
          </p>
        )}
      </div>

      {/* Error Message */}
      {submitError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          {submitError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Link
          href="/admin/trainers"
          className="flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-4 py-2.5 text-center font-semibold text-[color:var(--brand-purple)] transition-all hover:bg-[color:var(--brand-purple)]/5 disabled:opacity-50"
        >
          Отказ
        </Link>
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
