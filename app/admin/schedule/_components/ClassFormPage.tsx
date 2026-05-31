"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertClassAction } from "@/app/admin/_actions";
import { ClassForm, type ClassFormProps } from "./ClassForm";
import { type ClassFormInput } from "@/lib/validation/classForm";

export interface ClassFormPageProps
  extends Omit<ClassFormProps, "onSubmit" | "isLoading" | "successToast" | "onClearToast"> {}

/**
 * Client wrapper for ClassForm. Handles both "save and close" (redirect) and
 * "save and add more" (stay on form, reset date/time) actions.
 */
export function ClassFormPage({
  mode,
  practices,
  trainers,
  initialData,
  defaultDepositEur,
}: ClassFormPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = async (
    data: ClassFormInput,
    action: "save_and_close" | "save_and_add",
  ) => {
    const result = await upsertClassAction(data);

    if (result.ok) {
      if (action === "save_and_close" || mode === "edit") {
        const successParam =
          mode === "edit" ? "success=class_updated" : "success=class_created";
        startTransition(() => {
          router.push(`/admin/schedule?${successParam}`);
        });
        return { stay: false as const };
      }
      // save_and_add: stay on form
      const count = result.count ?? 1;
      const msg =
        count > 1
          ? `✓ Създадени са ${count} класа успешно!`
          : "✓ Класът е добавен успешно!";
      setToast(msg);
      return { stay: true as const };
    } else {
      return { error: result.message };
    }
  };

  return (
    <ClassForm
      mode={mode}
      practices={practices}
      trainers={trainers}
      initialData={initialData}
      defaultDepositEur={defaultDepositEur}
      onSubmit={handleSubmit}
      isLoading={isPending}
      successToast={toast}
      onClearToast={() => setToast(null)}
    />
  );
}
