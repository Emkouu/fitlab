"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePracticeAction } from "@/app/admin/_actions";
import { AdminConfirmModal } from "@/app/admin/_components/AdminConfirmModal";

type Practice = {
  id: string;
  name: string;
  slug: string;
  classCount: number;
};

interface PracticeListProps {
  practices: Practice[];
  /** Delete is a super_admin-only destructive op (see admin/_actions.ts). */
  isSuperAdmin: boolean;
}

export function PracticeList({ practices, isSuperAdmin }: PracticeListProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    practiceId: string;
    practiceName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeleteClick(practiceId: string, practiceName: string) {
    setError(null);
    setDeleteModal({ practiceId, practiceName });
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
      const result = await deletePracticeAction(deleteModal.practiceId);
      if (result.ok) {
        setDeleteModal(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (practices.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-8 text-center shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <p className="text-[color:var(--brand-ink)]/60">Няма практики</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--brand-purple)]/10">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Име
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Класове
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)]/70">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--brand-purple)]/10">
            {practices.map((p) => (
              <tr key={p.id} className="hover:bg-[color:var(--brand-purple)]/2 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-[color:var(--brand-ink)]">
                  {p.name}
                </td>
                <td className="px-6 py-4 text-sm text-[color:var(--brand-ink)]/60 font-mono">
                  {p.slug}
                </td>
                <td className="px-6 py-4 text-sm text-[color:var(--brand-ink)]/80">
                  {p.classCount}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/practices/${p.id}/edit`}
                      className="font-medium text-[color:var(--brand-magenta)] hover:text-[color:var(--brand-magenta)]/80 transition-colors"
                    >
                      Редактирай
                    </Link>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteClick(p.id, p.name)}
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
        title="Изтриване на практика"
        message={
          <>
            Изтриване на <strong>{deleteModal?.practiceName}</strong>. Това
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
