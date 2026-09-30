import { describe, expect, it } from "vitest";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { dailyStats, sumDays } from "./turnover";

// 10:00 Sofia (EEST, UTC+3) on two consecutive days.
const DAY1 = new Date("2026-09-16T07:00:00.000Z");
const DAY2 = new Date("2026-09-17T07:00:00.000Z");

const booking = (
  status: BookingStatus,
  onsiteMethod: string | null = null,
  classStartAt = DAY1,
  priceMinor = 1000,
) => ({ status, onsiteMethod, classStartAt, priceMinor });

describe("dailyStats", () => {
  it("a booking alone is not money", () => {
    const [d] = dailyStats([
      booking(BookingStatus.booked),
      booking(BookingStatus.paid),
      booking(BookingStatus.pending_deposit),
    ]);
    expect(d.turnoverMinor).toBe(0);
    expect(d.bookings).toBe(3);
  });

  it("counts class fees paid in cash at the class price", () => {
    const [d] = dailyStats([
      booking(BookingStatus.attended, "cash", DAY1, 1200),
      booking(BookingStatus.attended, "cash", DAY1, 1000),
    ]);
    expect(d.cashFeesMinor).toBe(2200);
    expect(d.turnoverMinor).toBe(2200);
  });

  it("counts subscription and Multisport without valuing them", () => {
    const [d] = dailyStats([
      booking(BookingStatus.attended, "subscription"),
      booking(BookingStatus.attended, "multisport"),
      booking(BookingStatus.attended, null),
    ]);
    expect(d).toMatchObject({ attended: 3, subscription: 1, multisport: 1, turnoverMinor: 0 });
  });

  it("a no-show pays no class fee", () => {
    const [d] = dailyStats([booking(BookingStatus.no_show, "cash")]);
    expect(d).toMatchObject({ noShows: 1, attended: 0, cashFeesMinor: 0 });
  });

  it("adds deposits received and subtracts deposits returned, on the day recorded", () => {
    const days = dailyStats(
      [booking(BookingStatus.attended, "cash", DAY1)],
      [
        { amountMinor: 1000, createdAt: DAY1 },
        { amountMinor: 1000, createdAt: DAY2 },
        { amountMinor: -1000, createdAt: DAY2 },
      ],
    );
    expect(days.map((d) => d.dayKey)).toEqual(["2026-09-17", "2026-09-16"]);
    expect(days[1]).toMatchObject({ depositsMinor: 1000, cashFeesMinor: 1000, turnoverMinor: 2000 });
    expect(days[0]).toMatchObject({ depositsMinor: 0, turnoverMinor: 0 });
  });

  it("ignores cancelled bookings entirely", () => {
    expect(dailyStats([booking(BookingStatus.cancelled, "cash")])).toEqual([]);
  });

  it("groups by the Sofia day, not the UTC one", () => {
    // 23:30 UTC on the 16th is already the 17th in Sofia.
    const [d] = dailyStats([booking(BookingStatus.booked, null, new Date("2026-09-16T23:30:00Z"))]);
    expect(d.dayKey).toBe("2026-09-17");
  });
});

describe("sumDays", () => {
  it("adds every column", () => {
    const t = sumDays(
      dailyStats(
        [booking(BookingStatus.attended, "cash", DAY1), booking(BookingStatus.attended, "subscription", DAY2)],
        [{ amountMinor: 1000, createdAt: DAY2 }],
      ),
    );
    expect(t).toMatchObject({ turnoverMinor: 2000, depositsMinor: 1000, cashFeesMinor: 1000, attended: 2, subscription: 1 });
  });
});
