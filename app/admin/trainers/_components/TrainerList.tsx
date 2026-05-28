"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTrainerAction } from "@/app/admin/_actions";

type Trainer = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  specialties: Array<{ name: string }>;
  user: { email: string | null } | null;
};

interface TrainerListProps {
  trainers: Trainer[];
}

export function TrainerList({ trainers }: TrainerListProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    trainerId: string;
    trainerName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open delete modal
  function handleDeleteClick(trainerId: string, trainerName: string) {
    setError(null);
    setDeleteModal({ trainerId, trainerName });
    dialogRef.current?.showModal();
  }

  // Close delete modal
  function handleCloseModal() {
    setDeleteModal(null);
    setError(null);
    dialogRef.current?.close();
  }

  // Handle backdrop click to close modal
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      handleCloseModal();
    }
  }

  // Handle delete confirmation
  function handleConfirmDelete() {
    if (!deleteModal) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteTrainerAction(deleteModal.trainerId);

      if (result.ok) {
        handleCloseModal();
        // Refetch the page to update the trainer list
        router.refresh();
        // Optionally show success toast (when toast system is implemented)
      } else {
        setError(result.message);
      }
    });
  }

  // Empty state
  if (trainers.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-8 text-center shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <p className="text-[color:var(--brand-ink)]/60">Няма треньори</p>
      </div>
    );
  }

  return (
    <>
      {/* Trainers Table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--brand-purple)]/10">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Име
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Специалности
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Свързан потребител
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--brand-purple)]/10">
            {trainers.map((trainer) => (
              <tr
                key={trainer.id}
                className="hover:bg-[color:var(--brand-purple)]/2 transition-colors"
              >
                {/* Name */}
                <td className="px-6 py-4 text-sm font-medium text-[color:var(--brand-ink)]">
                  {trainer.name}
                </td>

                {/* Specialties */}
                <td className="px-6 py-4 text-sm text-[color:var(--brand-ink)]/80">
                  {trainer.specialties.length > 0
                    ? trainer.specialties.map((s) => s.name).join(", ")
                    : "—"}
                </td>

                {/* Linked User */}
                <td className="px-6 py-4 text-sm text-[color:var(--brand-ink)]/80">
                  {trainer.user?.email || "—"}
                </td>

                {/* Actions */}
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-3">
                    {/* Edit Button */}
                    <Link
                      href={`/admin/trainers/${trainer.id}/edit`}
                      className="font-medium text-[color:var(--brand-magenta)] hover:text-[color:var(--brand-magenta)]/80 transition-colors"
                    >
                      Редактирай
                    </Link>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteClick(trainer.id, trainer.name)}
                      className="font-medium text-red-600 hover:text-red-700 transition-colors"
                    >
                      Изтрий
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        className="rounded-3xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="w-96 rounded-3xl bg-white px-8 py-8">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Modal Title */}
          <h2 className="font-display text-xl font-bold text-[color:var(--brand-ink)] mb-6">
            Изтриване на треньор {deleteModal?.trainerName}. Продължаваш ли?
          </h2>

          {/* Modal Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCloseModal}
              className="flex-1 rounded-xl border border-[color:var(--brand-purple)]/20 bg-white px-4 py-2.5 font-medium text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-purple)]/5 transition-colors"
            >
              Отказ
            </button>
            <button
              onClick={handleConfirmDelete}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 transition-colors"
            >
              Изтрий
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
