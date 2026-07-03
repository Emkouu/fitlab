"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTrainerAction } from "@/app/admin/_actions";
import { AdminConfirmModal } from "@/app/admin/_components/AdminConfirmModal";

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
  /** Delete is a super_admin-only destructive op (see admin/_actions.ts). */
  isSuperAdmin: boolean;
}

export function TrainerList({ trainers, isSuperAdmin }: TrainerListProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    trainerId: string;
    trainerName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeleteClick(trainerId: string, trainerName: string) {
    setError(null);
    setDeleteModal({ trainerId, trainerName });
  }

  function handleCloseModal() {
    if (isPending) return;
    setDeleteModal(null);
    setError(null);
  }

  function handleConfirmDelete() {
    if (!deleteModal) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTrainerAction(deleteModal.trainerId);
      if (result.ok) {
        setDeleteModal(null);
        router.refresh();
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

                    {/* Delete Button — super_admin only */}
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteClick(trainer.id, trainer.name)}
                        className="font-medium text-red-600 hover:text-red-700 transition-colors"
                      >
                        Изтрий
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminConfirmModal
        open={deleteModal !== null}
        title="Изтриване на треньор"
        message={
          <>
            Изтриване на <strong>{deleteModal?.trainerName}</strong>. Това
            действие е необратимо.
          </>
        }
        confirmLabel="Потвърди изтриването"
        destructive
        isPending={isPending}
        error={error}
        onConfirm={handleConfirmDelete}
        onClose={handleCloseModal}
      />
    </>
  );
}
