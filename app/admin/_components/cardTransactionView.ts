import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { formatEurMinor, formatSofiaDateTime } from "@/lib/format";
import {
  cardTransactionAttempts,
  isRecheckable,
  type PaymentAttemptSource,
} from "@/lib/payments/ecomm/transactionHistory";

/**
 * Server-side shaping of a `Payment` row into what the admin screens render.
 *
 * Kept out of the client component on purpose: the money formatting, the Sofia
 * clock and the response-code dictionary all stay on the server, and the browser
 * receives finished strings.
 */

export type CardTransactionAttemptView = {
  transId: string | null;
  result: string | null;
  resultCodeText: string | null;
  threeDSecure: string | null;
  rrn: string | null;
  approvalCode: string | null;
  cardMask: string | null;
  amountText: string;
  atText: string | null;
  isCurrent: boolean;
  refundText: string | null;
  /** The bank may still have news about this one — offer „Провери в банката". */
  canRecheck: boolean;
  /** Money can go back through this one — offer „Върни сумата". */
  canRefund: boolean;
};

export type CardTransactionGroupView = {
  paymentId: string;
  paymentStatusText: string;
  /** „Виняса Флоу · 15.08.2026 18:00" — which class the deposit was for. */
  classText: string | null;
  bookingStatusText: string | null;
  /** Only on /admin/payments, where rows span clients. */
  clientHref: string | null;
  clientLabel: string | null;
  attempts: CardTransactionAttemptView[];
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Чака резултат",
  paid: "Платено",
  failed: "Неуспешно",
  refunded: "Възстановено",
};

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Записан",
  pending_deposit: "Чака плащане",
  paid: "Платено",
  attended: "Посетил/а",
  no_show: "Не дойде",
  cancelled: "Отменено",
};

export type PaymentWithContext = PaymentAttemptSource & {
  id: string;
  status: PaymentStatus;
  booking: {
    status: BookingStatus;
    user: { id: string; fullName: string | null; phone: string | null; email: string | null };
    scheduledClass: { startAt: Date; practice: { name: string } };
  } | null;
};

export function toCardTransactionGroup(
  payment: PaymentWithContext,
  options: { withClient?: boolean } = {},
): CardTransactionGroupView {
  const booking = payment.booking;

  return {
    paymentId: payment.id,
    paymentStatusText: PAYMENT_STATUS_LABEL[payment.status],
    classText: booking
      ? `${booking.scheduledClass.practice.name} · ${formatSofiaDateTime(
          booking.scheduledClass.startAt,
        )}`
      : null,
    bookingStatusText: booking ? BOOKING_STATUS_LABEL[booking.status] : null,
    clientHref:
      options.withClient && booking ? `/admin/clients/${booking.user.id}` : null,
    clientLabel:
      options.withClient && booking
        ? (booking.user.fullName ??
          booking.user.phone ??
          booking.user.email ??
          "Клиент")
        : null,
    attempts: cardTransactionAttempts(payment).map((a) => ({
      transId: a.transId,
      result: a.result,
      resultCodeText: a.resultCodeText,
      threeDSecure: a.threeDSecure,
      rrn: a.rrn,
      approvalCode: a.approvalCode,
      cardMask: a.cardMask,
      amountText: formatEurMinor(a.amountMinor),
      atText: a.atISO ? formatSofiaDateTime(new Date(a.atISO)) : null,
      isCurrent: a.isCurrent,
      refundText: a.refund
        ? `${formatEurMinor(a.refund.amountMinor ?? 0)}${
            a.refund.atISO
              ? ` на ${formatSofiaDateTime(new Date(a.refund.atISO))}`
              : ""
          } · ${a.refund.transId}`
        : null,
      canRecheck: isRecheckable(a),
      canRefund: a.refundable,
    })),
  };
}

/** The `Payment` selection every card-transaction screen needs. */
export const CARD_TRANSACTION_INCLUDE = {
  booking: {
    select: {
      status: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
      scheduledClass: {
        select: { startAt: true, practice: { select: { name: true } } },
      },
    },
  },
} as const;
