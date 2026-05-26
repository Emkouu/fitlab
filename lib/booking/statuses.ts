import { BookingStatus } from "@/lib/generated/prisma/enums";

/**
 * Statuses that COUNT against capacity (SPEC §4 / CLAUDE.md). The booking
 * engine treats these as "active" — a class is full when the active count
 * reaches its capacity. cancelled / no_show free the spot.
 */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
  BookingStatus.attended,
];

/** Set form for fast O(1) membership in TS callers. */
export const ACTIVE_BOOKING_STATUS_SET: ReadonlySet<BookingStatus> = new Set(
  ACTIVE_BOOKING_STATUSES,
);
