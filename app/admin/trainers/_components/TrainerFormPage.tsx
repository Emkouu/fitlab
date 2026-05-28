"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertTrainerAction } from "@/app/admin/_actions";
import { TrainerForm, type TrainerFormProps } from "./TrainerForm";
import { type TrainerFormInput } from "@/lib/validation/trainerForm";

export type TrainerFormPageProps = Omit<
  TrainerFormProps,
  "onSubmit" | "isLoading"
>;

/**
 * Client wrapper for TrainerForm in create/edit mode.
 * Handles form submission with useTransition and displays success toasts.
 */
export function TrainerFormPage({
  mode,
  initialData,
  practices,
  availableUsers,
}: TrainerFormPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (data: TrainerFormInput) => {
    const result = await upsertTrainerAction(data);

    if (result.ok) {
      startTransition(() => {
        router.push("/admin/trainers?success=trainer_saved");
      });
    } else {
      // Error: return error to form for display
      return { error: result.message };
    }
  };

  return (
    <TrainerForm
      mode={mode}
      initialData={initialData}
      practices={practices}
      availableUsers={availableUsers}
      onSubmit={handleSubmit}
      isLoading={isPending}
    />
  );
}
