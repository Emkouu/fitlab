"use client";

import { formatEurMinor } from "@/lib/format";
import type { Payment } from "@/lib/generated/prisma/client";
import { PaymentStatus } from "@/lib/generated/prisma/enums";

type PaymentWithBooking = Payment & {
  booking?: {
    scheduledClass?: {
      practice?: { name: string };
    };
  } | null;
};

type Props = {
  payments: PaymentWithBooking[];
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Чакащо",
  paid: "Платено",
  refunded: "Възвърнато",
  failed: "Неуспешно",
};

const STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: "text-amber-600",
  paid: "text-green-600",
  refunded: "text-blue-600",
  failed: "text-red-600",
};

export function PaymentHistory({ payments }: Props) {
  if (!payments || payments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-gray-600">
          Няма история на плащания.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium text-[color:var(--brand-ink)]">
                {payment.booking?.scheduledClass?.practice?.name || "Депозит"}
              </p>
              <p className="text-[11px] text-[color:var(--brand-purple)]/60">
                {new Date(payment.createdAt).toLocaleDateString("bg-BG", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[color:var(--brand-ink)]">
                {formatEurMinor(payment.amount)}
              </p>
              <p className={`text-xs font-semibold ${STATUS_COLOR[payment.status]}`}>
                {STATUS_LABEL[payment.status]}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
