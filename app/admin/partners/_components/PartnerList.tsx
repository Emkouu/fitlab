"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePartnerAction } from "@/app/admin/_actions";
import { AdminConfirmModal } from "@/app/admin/_components/AdminConfirmModal";

type Partner = {
  id: string;
  name: string;
  logoUrl: string | null;
  siteUrl: string | null;
  promoCode: string | null;
  active: boolean;
};

interface PartnerListProps {
  partners: Partner[];
  /** Delete is a super_admin-only destructive op (see admin/_actions.ts). */
  isSuperAdmin: boolean;
}

export function PartnerList({ partners, isSuperAdmin }: PartnerListProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    partnerId: string;
    partnerName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCloseModal() {
    if (isPending) return;
    setDeleteModal(null);
    setError(null);
  }

  function handleConfirmDelete() {
    if (!deleteModal) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePartnerAction(deleteModal.partnerId);
      if (result.ok) {
        setDeleteModal(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (partners.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-8 text-center shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <p className="text-[color:var(--brand-ink)]/60">Няма партньори</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {partners.map((p) => (
          <li
            key={p.id}
            className={`rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] ${
              p.active ? "" : "opacity-50"
            }`}
          >
            <div className="flex items-center gap-3">
              {p.logoUrl ? (
                /* Remote partner logos come from arbitrary hosts → plain <img>. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.logoUrl}
                  alt={p.name}
                  className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-[color:var(--brand-pink)]/40"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-pink-soft)] font-display text-lg font-bold text-[color:var(--brand-magenta)]">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-[color:var(--brand-ink)]">
                  {p.name}
                  {!p.active && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      скрит
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-[color:var(--brand-purple)]/60">
                  {p.promoCode ?? "без код"}
                  {p.siteUrl ? ` · ${new URL(p.siteUrl).hostname}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/admin/partners/${p.id}/edit`}
                  className="font-medium text-[color:var(--brand-magenta)] transition-colors hover:text-[color:var(--brand-magenta)]/80"
                >
                  Редактирай
                </Link>
                {isSuperAdmin && (
                  <button
                    onClick={() => {
                      setError(null);
                      setDeleteModal({ partnerId: p.id, partnerName: p.name });
                    }}
                    className="font-medium text-red-600 transition-colors hover:text-red-700"
                  >
                    Изтрий
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <AdminConfirmModal
        open={deleteModal !== null}
        title="Изтриване на партньор"
        message={
          <>
            Изтриване на <strong>{deleteModal?.partnerName}</strong>. Това
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
