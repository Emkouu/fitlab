"use client";

import { useState } from "react";
import { formatSofiaDay, formatSofiaTime, formatEurMinor } from "@/lib/format";
import { BookingStatus, BookingSource } from "@/lib/generated/prisma/enums";
import type { Booking, ScheduledClass } from "@/lib/generated/prisma/client";
import { CancelBookingButton } from "./CancelBookingButton";
import { ContinuePaymentButton } from "./ContinuePaymentButton";

type BookingWithRelations = Booking & {
  scheduledClass: ScheduledClass & {
    practice: { name: string };
    trainers: { id: string; name: string }[];
    studio: { name: string; cancelWindowHours: number };
  };
};

type Props = {
  booking: BookingWithRelations;
  isPast?: boolean;
  onCancelled?: () => void;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Записан",
  pending_deposit: "Чекам плащане",
  paid: "Платено",
  attended: "Посетил/а",
  no_show: "Не дойде",
  cancelled: "Отменено",
};

const STATUS_COLOR: Record<BookingStatus, string> = {
  booked: "bg-green-50 text-green-700 border-green-200",
  pending_deposit: "bg-white text-yellow-600 border-yellow-400 border-2",
  paid: "bg-green-50 text-green-700 border-green-200",
  attended: "bg-blue-50 text-blue-700 border-blue-200",
  no_show: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-700 border-gray-200",
};

export function BookingCard({ booking, isPast, onCancelled }: Props) {
  const [isCancelled, setIsCancelled] = useState(false);
  const { scheduledClass } = booking;
  const startDate = new Date(scheduledClass.startAt);
  const endDate = new Date(
    startDate.getTime() + scheduledClass.durationMinutes * 60 * 1000,
  );

  const handleCancelled = () => {
    setIsCancelled(true);
    onCancelled?.();
  };

  // If locally cancelled, show cancelled state immediately
  const displayStatus = isCancelled ? BookingStatus.cancelled : booking.status;

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-opacity ${
        isPast ? "border-gray-200 bg-white opacity-70" : "border-purple-100 bg-white"
      }`}
    >
      {/* Header: Practice name + status badge */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-display text-sm font-bold text-[color:var(--brand-ink)]">
            {scheduledClass.practice.name}
          </h3>
          <p className="text-[11px] text-[color:var(--brand-purple)]/60">
            {scheduledClass.studio.name}
          </p>
        </div>
        <span
          className={`inline-block whitespace-nowrap rounded border px-2 py-1 text-[10px] font-semibold ${STATUS_COLOR[displayStatus]}`}
        >
          {STATUS_LABEL[displayStatus]}
        </span>
      </div>

      {/* Date & time */}
      <div className="mb-3 space-y-1">
        <p className="text-xs font-medium text-[color:var(--brand-ink)]">
          {formatSofiaDay(startDate)}
        </p>
        <p className="text-xs text-[color:var(--brand-purple)]/70">
          {formatSofiaTime(startDate)} – {formatSofiaTime(endDate)} ({scheduledClass.durationMinutes} мин)
        </p>
      </div>

      {/* Trainers */}
      {scheduledClass.trainers.length > 0 && (
        <div className="mb-3 text-xs text-[color:var(--brand-purple)]/70">
          Треньор{scheduledClass.trainers.length > 1 ? "и" : ""}: {scheduledClass.trainers.map((t) => t.name).join(", ")}
        </div>
      )}

      {/* Deposit info + source */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-[color:var(--brand-purple)]/5 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-[color:var(--brand-purple)]/60">
              Депозит
            </p>
            <p className="text-sm font-bold text-[color:var(--brand-ink)]">
              {formatEurMinor(scheduledClass.depositAmount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase text-[color:var(--brand-purple)]/60">
              Статус
            </p>
            <p
              className={`text-xs font-semibold ${
                displayStatus === BookingStatus.paid ||
                displayStatus === BookingStatus.attended ||
                booking.source === BookingSource.balance
                  ? "text-green-600"
                  : displayStatus === BookingStatus.cancelled
                    ? "text-gray-600"
                    : "text-amber-600"
              }`}
            >
              {displayStatus === BookingStatus.paid ||
              displayStatus === BookingStatus.attended ||
              booking.source === BookingSource.balance
                ? "Платено"
                : displayStatus === BookingStatus.cancelled
                  ? "Отменено"
                  : "Чакащо"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-[color:var(--brand-purple)]/60">
          {booking.source === "card"
            ? "💳 Платено с карта"
            : booking.source === "balance"
              ? "✓ Платено с баланс"
              : "💰 Плащане на място"}
        </p>
      </div>

      {/* Continue payment button for unpaid card bookings */}
      {!isPast &&
        !isCancelled &&
        booking.status === BookingStatus.booked &&
        booking.source === BookingSource.card && (
          <ContinuePaymentButton bookingId={booking.id} className="mb-3" />
        )}

      {/* Cancel button (only for upcoming, non-cancelled bookings) */}
      {!isPast &&
        displayStatus !== BookingStatus.cancelled && (
          <CancelBookingButton
            booking={booking}
            cancelWindowHours={scheduledClass.studio.cancelWindowHours}
            onCancelled={handleCancelled}
          />
        )}
    </div>
  );
}
