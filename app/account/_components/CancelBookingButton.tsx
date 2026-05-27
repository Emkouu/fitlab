"use client";

import { useState, useMemo } from "react";
import type { Booking, ScheduledClass } from "@/lib/generated/prisma/client";

type BookingWithStudio = Booking & {
  scheduledClass: ScheduledClass & { studio?: { cancelWindowHours: number } | null };
};

type Props = {
  booking: BookingWithStudio;
  cancelWindowHours?: number;
  onCancelled?: () => void;
};

export function CancelBookingButton({ booking, cancelWindowHours = 4, onCancelled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute cancellation window once — stable reference
  // eslint-disable-next-line react-hooks/purity
  const canCancelSafely = useMemo(() => {
    const now = Date.now();
    const windowMs = cancelWindowHours * 60 * 60 * 1000;
    const classTime = new Date(booking.scheduledClass.startAt).getTime();
    const cutoff = classTime - windowMs;
    return now < cutoff;
  }, [booking.scheduledClass.startAt, cancelWindowHours]);

  async function handleCancel() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to cancel booking");
        setBusy(false);
        return;
      }

      // Success — refresh or call callback
      if (onCancelled) {
        onCancelled();
      } else {
        // Fallback: reload page
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={handleCancel}
        disabled={busy}
        className={`w-full min-h-10 rounded-2xl px-4 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60 ${
          canCancelSafely
            ? "border-2 border-amber-400 bg-white text-amber-600 hover:bg-amber-50"
            : "border-2 border-red-500 bg-white text-red-600 hover:bg-red-50"
        }`}
      >
        {busy ? "Отмяна…" : canCancelSafely ? "Отмяна" : "Отмяна (депозит — изгубен)"}
      </button>
      {!canCancelSafely && (
        <p className="text-[11px] text-red-600 mt-1">
          Периодът за отмяна е преминал. Депозитът е изгубен.
        </p>
      )}
    </div>
  );
}
