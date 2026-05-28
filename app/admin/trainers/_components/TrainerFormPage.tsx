"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertTrainerAction } from "@/app/admin/_actions";
import { TrainerForm, type TrainerFormProps } from "./TrainerForm";
import { type TrainerFormInput } from "@/lib/validation/trainerForm";

export interface TrainerFormPageProps
  extends Omit<TrainerFormProps, "onSubmit" | "isLoading"> {}

/**
 * Client wrapper for TrainerForm in create/edit mode.
 * Handles form submission with useTransition and displays success toasts.
 */
export function TrainerFormPage({
  mode,
  initialData,
  practices,
  availableUsers,
  currentLinkedUserId,
}: TrainerFormPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (data: TrainerFormInput) => {
    const result = await upsertTrainerAction(data);

    if (result.ok) {
      // Success: redirect with toast query param based on mode
      const successParam =
        mode === "edit" ? "success=trainer_updated" : "success=trainer_created";
      startTransition(() => {
        router.push(`/admin/trainers?${successParam}`);
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
      currentLinkedUserId={currentLinkedUserId}
      onSubmit={handleSubmit}
      isLoading={isPending}
    />
  );
}
