import { prisma } from "@/lib/db";
import { BookingSource } from "@/lib/generated/prisma/enums";
import { depositAmountMinor } from "@/lib/deposit";

/**
 * The studio-level deposit amount, for desk actions that aren't tied to one
 * class (an admin recording a cash deposit, the „Възстанови депозит" panel).
 * Multi-location is Phase 2, so there is exactly one studio row.
 */
export async function studioDepositAmountMinor(): Promise<number> {
  const studio = await prisma.studio.findFirst({ select: { defaultDeposit: true } });
  return depositAmountMinor(null, studio);
}

/**
 * The only two money movements the deposit ever makes: burning the standing
 * guarantee, and giving it back when staff correct the mark that burned it.
 *
 * Previously each caller (attendance, admin cancel, client cancel) subtracted a
 * fixed `DEPOSIT_UNIT_MINOR` behind its own `gte` guard. With the amount
 * configurable that shape breaks: a client holding €10 against a class whose
 * deposit was since raised to €20 would fail the guard and silently burn
 * nothing. So a burn consumes whatever the client actually has standing, and
 * records it on the booking for an exact restore.
 *
 * Both operations are idempotent by construction — `burnDeposit` writes
 * `depositBurnedMinor` only while it is still NULL, and `restoreDeposit` only
 * while it is set, so a double tap or a replayed action moves money once.
 */

/** Sources that have a recorded deposit behind them at all. */
export function sourceCarriesDeposit(source: BookingSource): boolean {
  // `onsite_deposit` is cash handed over at the desk; nothing was ever recorded
  // on the profile, so there is nothing to burn or give back.
  return source === BookingSource.card || source === BookingSource.balance;
}

/**
 * Consume the client's standing deposit for this booking.
 *
 * Returns the amount taken (0 when there was nothing to take, or when this
 * booking's deposit was already burned).
 */
export async function burnDeposit(bookingId: string): Promise<number> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      source: true,
      depositBurnedMinor: true,
      user: { select: { depositBalance: true } },
    },
  });
  if (!booking) return 0;
  if (!sourceCarriesDeposit(booking.source)) return 0;
  // Already burned by an earlier mark on this same booking.
  if (booking.depositBurnedMinor !== null) return 0;

  const amount = booking.user.depositBalance;
  if (amount <= 0) return 0;

  // Claim and debit in ONE transaction. The claim is what makes this idempotent
  // (two racing taps: only one sees `depositBurnedMinor: null`), and the debit's
  // `gte` guard is what keeps the balance from going negative if it moved
  // underneath us. Either both land or neither does — a half-applied burn would
  // leave the booking claiming money the client still has.
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, depositBurnedMinor: null },
        data: { depositBurnedMinor: amount },
      });
      if (claimed.count === 0) return 0;

      const taken = await tx.user.updateMany({
        where: { id: booking.userId, depositBalance: { gte: amount } },
        data: { depositBalance: { decrement: amount } },
      });
      // Balance changed since we read it (a concurrent burn on another booking).
      // Throwing rolls the claim back rather than recording a burn that never
      // took money.
      if (taken.count === 0) throw new BalanceMovedError();

      return amount;
    });
  } catch (err) {
    if (err instanceof BalanceMovedError) return 0;
    throw err;
  }
}

/** Internal signal used to roll back a claim; never escapes this module. */
class BalanceMovedError extends Error {}

/**
 * Give back exactly what this booking's burn took — the undo behind „сгрешен
 * no_show". Returns the amount restored, 0 if this booking never burned one.
 */
export async function restoreDeposit(bookingId: string): Promise<number> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, depositBurnedMinor: true },
  });
  if (!booking) return 0;

  const amount = booking.depositBurnedMinor;
  if (amount === null || amount <= 0) return 0;

  // Release the claim and credit in one transaction, same reasoning as the burn.
  // Releasing conditionally is what stops a double tap crediting twice.
  return prisma.$transaction(async (tx) => {
    const released = await tx.booking.updateMany({
      where: { id: booking.id, depositBurnedMinor: { not: null } },
      data: { depositBurnedMinor: null },
    });
    if (released.count === 0) return 0;

    await tx.user.update({
      where: { id: booking.userId },
      data: { depositBalance: { increment: amount } },
    });

    return amount;
  });
}
