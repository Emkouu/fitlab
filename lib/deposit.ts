/**
 * Deposit model — single source of truth.
 *
 * A deposit is paid ONCE (at the studio, recorded by an admin, or online by
 * card) and then STAYS on the profile. It is not a per-booking fee and not a
 * spendable wallet: it is the standing guarantee that lets a client reserve a
 * spot online, over and over.
 *
 * Booking a class does NOT touch it. Attending does NOT touch it. It is only
 * consumed ("усвоява се") when the client breaks the deal:
 *   - `no_show` on a booked class, or
 *   - cancelling later than the studio's `cancelWindowHours`.
 * After that the client must pay a new deposit to reserve again.
 *
 * The class fee itself is a separate thing — always settled on-site, recorded
 * by staff in Attendance (see lib/payments/classFeeMethods.ts). Its amount
 * resolves through `classPriceMinor()` in lib/pricing.ts, which follows exactly
 * the same studio-default-with-override shape as the deposit below.
 *
 * ── The amount ───────────────────────────────────────────────────────────────
 * Resolution order, and the only place it lives:
 *   1. `ScheduledClass.depositAmount` — per-class override, NULL by default.
 *   2. `Studio.defaultDeposit`        — what admins set in Админ → Настройки.
 *   3. `FALLBACK_DEPOSIT_MINOR`       — last resort, so an amount is never
 *      absent from a screen that leads to a card transaction.
 *
 * ── The store ────────────────────────────────────────────────────────────────
 * `User.depositBalance` holds the deposit the client currently has standing, in
 * EUR cents — the amount actually taken from them, NOT a multiple of some fixed
 * unit. It deliberately isn't a count: once the amount is configurable, "two
 * deposits" has no single value, and a client who paid €10 before the studio
 * raised the deposit to €20 still holds exactly €10.
 *
 * That is why a burn consumes the whole standing deposit rather than
 * subtracting the class's amount: the guarantee is one indivisible thing, and
 * subtracting a *different* number than was taken is how a balance ends up
 * stuck at some unspendable remainder. `Booking.depositBurnedMinor` records
 * what was taken, so correcting a mis-tapped no-show gives back exactly that.
 */

/** €10.00 — used only when neither the class nor the studio has a usable amount. */
export const FALLBACK_DEPOSIT_MINOR = 1000;

export type DepositableClass = { depositAmount?: number | null } | null | undefined;
export type DepositableStudio = { defaultDeposit?: number | null } | null | undefined;

/**
 * The deposit required to reserve a spot on this class, in EUR cents.
 *
 * A stored 0 is meaningful (a class that needs no guarantee), so only
 * NULL/undefined and nonsensical values fall through to the next level.
 */
export function depositAmountMinor(
  scheduledClass: DepositableClass,
  studio: DepositableStudio,
): number {
  const fromClass = scheduledClass?.depositAmount;
  if (isUsableAmount(fromClass)) return fromClass;

  const fromStudio = studio?.defaultDeposit;
  if (isUsableAmount(fromStudio)) return fromStudio;

  return FALLBACK_DEPOSIT_MINOR;
}

/**
 * Does this balance cover the deposit the class asks for?
 *
 * The booking gate. A class with a 0 deposit is always covered — that is the
 * point of allowing 0.
 */
export function hasDepositFor(balanceMinor: number, requiredMinor: number): boolean {
  if (requiredMinor <= 0) return true;
  if (!Number.isFinite(balanceMinor)) return false;
  return balanceMinor >= requiredMinor;
}

function isUsableAmount(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
