/**
 * Class price — single source of truth.
 *
 * Distinct from the deposit (`lib/deposit.ts`): the deposit is a one-off €10
 * standing guarantee that only buys the right to reserve. The **price** here is
 * what the training itself costs, and it is always settled on site (cash,
 * subscription card or Multisport — see `lib/payments/classFeeMethods.ts`).
 *
 * It exists as a stored field because the acquirer requires the end price of
 * the service to be visible to the client at every step that leads to a
 * transaction (Fibank instruction §I.8 and §I.9): the price shown must be
 * final — all taxes included, nothing added later.
 *
 * Resolution order, and the only place it lives:
 *   1. `Practice.priceMinor` — per-practice override, NULL by default.
 *   2. `Studio.defaultClassPrice` — the studio's standard class price.
 *   3. `FALLBACK_CLASS_PRICE_MINOR` — last resort, so a price is never absent
 *      from the UI even if a row is somehow missing.
 *
 * All amounts are EUR minor units (cents), matching `ScheduledClass.depositAmount`.
 */

/** €10.00 — the standard price of one group class. */
export const FALLBACK_CLASS_PRICE_MINOR = 1000;

export type PriceablePractice = { priceMinor?: number | null } | null | undefined;
export type PriceableStudio = { defaultClassPrice?: number | null } | null | undefined;

/**
 * The final price of one class, in EUR cents.
 *
 * A stored 0 is meaningful (a free class), so only NULL/undefined and
 * nonsensical values fall through to the next level.
 */
export function classPriceMinor(
  practice: PriceablePractice,
  studio: PriceableStudio,
): number {
  const fromPractice = practice?.priceMinor;
  if (isUsableAmount(fromPractice)) return fromPractice;

  const fromStudio = studio?.defaultClassPrice;
  if (isUsableAmount(fromStudio)) return fromStudio;

  return FALLBACK_CLASS_PRICE_MINOR;
}

function isUsableAmount(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
