/**
 * Deposits that actually reached the studio („приети депозити").
 *
 * `User.depositBalance` is a current state: it says what a client holds, never
 * that it arrived, and least of all when. So a deposit paid in cash and
 * recorded at the desk was invisible in Статистика — only card money showed up,
 * and only indirectly, through the bookings it paid for.
 *
 * `DepositEntry` is the arrival record — one signed row per movement, cash and
 * card alike — and this is the pure function that closes a month over it.
 *
 * Burns are NOT here. A burn does not move money between the studio and the
 * client; it converts a deposit already received into money kept, and it is
 * reported from `Booking.depositBurnedMinor` (see `burnedDeposits.ts`). Adding
 * it here would count the same euro twice.
 */

export type DepositEntryMethodKey = "cash" | "card" | "manual";

export type ReceivedDepositRow = {
  /** Signed EUR cents: positive received, negative returned. */
  amountMinor: number;
  method: DepositEntryMethodKey;
};

export type MethodTotals = { totalMinor: number; count: number };

export type ReceivedDepositTotals = {
  /** Everything that came in, EUR cents. */
  receivedMinor: number;
  /** How many deposits came in. */
  receivedCount: number;
  /** Everything given back, as a positive number. */
  returnedMinor: number;
  returnedCount: number;
  /** received − returned. What the studio is actually holding from this month. */
  netMinor: number;
  /** Incoming money per method — the split staff care about (брой vs карта). */
  receivedByMethod: Record<DepositEntryMethodKey, MethodTotals>;
};

const EMPTY_METHODS = (): Record<DepositEntryMethodKey, MethodTotals> => ({
  cash: { totalMinor: 0, count: 0 },
  card: { totalMinor: 0, count: 0 },
  manual: { totalMinor: 0, count: 0 },
});

export function receivedDepositTotals(
  rows: readonly ReceivedDepositRow[],
): ReceivedDepositTotals {
  const receivedByMethod = EMPTY_METHODS();
  let receivedMinor = 0;
  let receivedCount = 0;
  let returnedMinor = 0;
  let returnedCount = 0;

  for (const row of rows) {
    const amount = row.amountMinor;
    if (!Number.isFinite(amount) || amount === 0) continue;

    if (amount > 0) {
      receivedMinor += amount;
      receivedCount += 1;
      const m = receivedByMethod[row.method];
      m.totalMinor += amount;
      m.count += 1;
    } else {
      returnedMinor += -amount;
      returnedCount += 1;
    }
  }

  return {
    receivedMinor,
    receivedCount,
    returnedMinor,
    returnedCount,
    netMinor: receivedMinor - returnedMinor,
    receivedByMethod,
  };
}
