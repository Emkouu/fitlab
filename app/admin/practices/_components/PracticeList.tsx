"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePracticeAction } from "@/app/admin/_actions";

type Practice = {
  id: string;
  name: string;
  slug: string;
  classCount: number;
};

interface PracticeListProps {
  practices: Practice[];
}

export function PracticeList({ practices }: PracticeListProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    practiceId: string;
    practiceName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleDeleteClick(practiceId: string, practiceName: string) {
    setError(null);
    setDeleteModal({ practiceId, practiceName });
    dialogRef.current?.showModal();
  }

  function handleCloseModal() {
    setDeleteModal(null);
    setError(null);
    dialogRef.current?.close();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) handleCloseModal();
  }

  function handleConfirmDelete() {
    if (!deleteModal) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePracticeAction(deleteModal.practiceId);
      if (result.ok) {
        handleCloseModal();
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
                      Уреди
                    </Link>
                    <button
                      onClick={() => handleDeleteClick(p.id, p.name)}
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

      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        className="rounded-3xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="w-96 rounded-3xl bg-white px-8 py-8">
          {error && (
            <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <h2 className="font-display text-xl font-bold text-[color:var(--brand-ink)] mb-6">
            Изтриване на практика {deleteModal?.practiceName}. Продължаваш ли?
          </h2>
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
