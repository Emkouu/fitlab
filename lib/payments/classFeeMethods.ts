/**
 * How the client pays the CLASS FEE — always on-site, never online.
 *
 * Distinct from the deposit (lib/deposit.ts): the deposit is a one-off €10
 * guarantee that only buys the right to reserve. The fee for the training
 * itself is settled in the room, and staff record which way it was paid so
 * reports stay honest.
 *
 * The client picks an intended method in the booking modal; staff confirm or
 * correct it in Attendance when marking „Дойде" (and can still edit it after,
 * in case the wrong person on the list got charged).
 *
 * Persisted on `Booking.onsiteMethod`.
 */
export const CLASS_FEE_METHODS = ["subscription", "cash", "multisport"] as const;

export type ClassFeeMethod = (typeof CLASS_FEE_METHODS)[number];

export const CLASS_FEE_METHOD_LABEL: Record<ClassFeeMethod, string> = {
  subscription: "Абонаментна карта",
  cash: "В брой",
  multisport: "Multisport",
};

export function isClassFeeMethod(value: unknown): value is ClassFeeMethod {
  return (
    typeof value === "string" &&
    (CLASS_FEE_METHODS as readonly string[]).includes(value)
  );
}

/** Label for a stored (possibly NULL / legacy) value. */
export function classFeeMethodLabel(value: unknown): string | null {
  return isClassFeeMethod(value) ? CLASS_FEE_METHOD_LABEL[value] : null;
}
