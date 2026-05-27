"use client";

import { useState } from "react";

type ComingSoonModalProps = {
  title: string;
  phase: string;
  onClose: () => void;
};

export function ComingSoonModal({
  title,
  phase,
  onClose,
}: ComingSoonModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
      <dialog
        open
        className="w-full max-w-[320px] rounded-3xl bg-white px-6 py-8 shadow-2xl text-center"
      >
        <h2 className="font-display text-lg font-bold">
          {title}
        </h2>
        <p className="mt-4 text-sm text-[color:var(--brand-purple)]/75">
          Тази функция идва в {phase}
        </p>
        <p className="mt-2 text-xs text-[color:var(--brand-purple)]/60">
          Благодаря за търпението!
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-[color:var(--brand-purple)] px-4 py-2.5 font-semibold text-white transition-all hover:opacity-90"
        >
          Разбрано
        </button>
      </dialog>
    </div>
  );
}
