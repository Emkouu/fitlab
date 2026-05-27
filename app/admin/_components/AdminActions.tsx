"use client";

import { useState } from "react";
import { ComingSoonModal } from "./ComingSoonModal";

export function AdminActions() {
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showTrainersModal, setShowTrainersModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowAddClassModal(true)}
        className="w-full rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Добави клас
      </button>
      <button
        onClick={() => setShowTrainersModal(true)}
        className="w-full rounded-2xl bg-white px-5 py-3 text-center font-display font-semibold text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-all hover:shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)]"
      >
        Треньори
      </button>

      {showAddClassModal && (
        <ComingSoonModal
          title="Добави клас"
          phase="Phase 2.2"
          onClose={() => setShowAddClassModal(false)}
        />
      )}
      {showTrainersModal && (
        <ComingSoonModal
          title="Управление на треньори"
          phase="Phase 2.3"
          onClose={() => setShowTrainersModal(false)}
        />
      )}
    </>
  );
}
