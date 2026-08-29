import { prisma } from "@/lib/db";
import {
  DepositEntryKind,
  DepositEntryMethod,
} from "@/lib/generated/prisma/enums";
import { depositAmountMinor } from "@/lib/deposit";
import { STUDIO_SLUG } from "@/lib/studio";

/**
 * The studio-level deposit amount, for desk actions that aren't tied to one
 * class (an admin recording a cash deposit, the „Възстанови депозит" panel).
 *
 * Resolved by slug, not by `findFirst()`. The database is not guaranteed to
 * hold a single studio — the booking-engine tests upsert one of their own —
 * and an unordered `findFirst` picked whichever row came back. That is how the
 * desk button recorded the test studio's €20 onto real clients while every
 * other screen, which looks the studio up by slug, kept saying €10.
 *
 * Falls back through `depositAmountMinor` if the row is somehow missing, so a
 * desk action can never write a zero deposit by accident.
 */
export async function studioDepositAmountMinor(): Promise<number> {
  const studio = await prisma.studio.findUnique({
    where: { slug: STUDIO_SLUG },
    select: { defaultDeposit: true },
  });
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
 *
 * A burn no longer looks at `Booking.source`. It used to refuse anything but
 * `card`/`balance`, on the reasoning that an `onsite_deposit` booking had no
 * recorded deposit behind it — true only while the card was the single way a
 * deposit could reach a profile. An admin recording a deposit paid in cash, and
 * staff adding a walk-in from Attendance (which writes `onsite_deposit`), break
 * that pairing: the client really does hold a standing guarantee, and a no-show
 * has to consume it. What the burn asks now is the honest question — does this
 * client have a deposit standing? — and `depositBalance <= 0` answers „no" for
 * the first-visit client who never paid one.
 */

/**
 * Record that a standing deposit arrived, went back, or was corrected.
 *
 * The balance column alone cannot answer „колко депозити приехме този месец":
 * it is a current state, not a history, and a deposit paid in cash at the desk
 * used to move it silently. Every desk action and every settled card payment
 * writes a row here instead, so the money is visible in Статистика whichever
 * way it came in.
 *
 * Best-effort by design — the caller has already moved the money, and a
 * bookkeeping row that fails to insert must never undo a real payment. A
 * failure is logged, not thrown.
 */
export async function recordDepositEntry(input: {
  userId: string;
  /**
   * EUR cents. For `received`/`returned` the sign is derived from the kind, so
   * a plain amount is enough; a `correction` keeps the sign it is given, since
   * a hand edit can go either way and is not a payment in either direction.
   */
  amountMinor: number;
  kind: DepositEntryKind;
  method: DepositEntryMethod;
  /** The admin at the desk; omit for a card payment the client made alone. */
  recordedById?: string | null;
  paymentId?: string | null;
  note?: string | null;
}): Promise<void> {
  const exact = Math.trunc(input.amountMinor);
  const magnitude = Math.abs(exact);
  if (magnitude === 0) return;

  const signed =
    input.kind === DepositEntryKind.correction
      ? exact
      : input.kind === DepositEntryKind.received
        ? magnitude
        : -magnitude;

  try {
    await prisma.depositEntry.create({
      data: {
        userId: input.userId,
        amountMinor: signed,
        kind: input.kind,
        method: input.method,
        recordedById: input.recordedById ?? null,
        paymentId: input.paymentId ?? null,
        note: input.note ?? null,
      },
    });
  } catch (err) {
    console.error("[depositLedger] recordDepositEntry failed", input, err);
  }
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
      depositBurnedMinor: true,
      user: { select: { depositBalance: true } },
    },
  });
  if (!booking) return 0;
  // Already burned by an earlier mark on this same booking.
  if (booking.depositBurnedMinor !== null) return 0;

  const amount = booking.user.depositBalance;
  if (amount <= 0) return 0;

  // How the client paid the deposit we are about to consume. A burn is income
  // and gets rung up on the касов апарат, where „в брой" and „с карта" are
  // different keys — and the balance is one pot with no history of its own, so
  // the origin has to be captured here, while the arrival record is still
  // reachable. NULL for a deposit recorded before the ledger existed; the
  // report says „неизвестен произход" rather than guessing a key.
  const lastArrival = await prisma.depositEntry.findFirst({
    where: { userId: booking.userId, kind: DepositEntryKind.received },
    orderBy: { createdAt: "desc" },
    select: { method: true },
  });

  // Claim and debit in ONE transaction. The claim is what makes this idempotent
  // (two racing taps: only one sees `depositBurnedMinor: null`), and the debit's
  // `gte` guard is what keeps the balance from going negative if it moved
  // underneath us. Either both land or neither does — a half-applied burn would
  // leave the booking claiming money the client still has.
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, depositBurnedMinor: null },
        data: {
          depositBurnedMinor: amount,
          depositBurnedMethod: lastArrival?.method ?? null,
        },
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
      // `depositFiscalized*` is deliberately left alone: if this burn was
      // already rung up, the receipt exists whatever we do here, and the report
      // has to keep asking for a сторно until staff say they issued one.
      data: { depositBurnedMinor: null, depositBurnedMethod: null },
    });
    if (released.count === 0) return 0;

    await tx.user.update({
      where: { id: booking.userId },
      data: { depositBalance: { increment: amount } },
    });

    return amount;
  });
}
