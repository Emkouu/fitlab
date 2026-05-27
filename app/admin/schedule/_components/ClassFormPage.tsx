"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertClassAction } from "@/app/admin/_actions";
import { ClassForm, type ClassFormProps } from "./ClassForm";
import { type ClassFormInput } from "@/lib/validation/classForm";

export interface ClassFormPageProps
  extends Omit<ClassFormProps, "onSubmit" | "isLoading"> {}

/**
 * Client wrapper for ClassForm in create mode.
 * Handles form submission with useTransition.
 */
export function ClassFormPage({
  mode,
  practices,
  trainers,
  initialData,
}: ClassFormPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (data: ClassFormInput) => {
    const result = await upsertClassAction(data);

    if (result.ok) {
      // Success: redirect with toast query param based on mode
      const successParam =
        mode === "edit" ? "success=class_updated" : "success=class_created";
      startTransition(() => {
        router.push(`/admin/schedule?${successParam}`);
      });
    } else {
      // Error: return error to form for display
      return { error: result.message };
    }
  };

  return (
    <ClassForm
      mode={mode}
      practices={practices}
      trainers={trainers}
      initialData={initialData}
      onSubmit={handleSubmit}
      isLoading={isPending}
    />
  );
}
