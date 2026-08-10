import { describe, expect, it } from "vitest";
import { BookingSource, BookingStatus } from "@/lib/generated/prisma/enums";
import { countsTowardTurnover, dailyStats } from "./turnover";

// 10:00 Sofia (EEST, UTC+3) on two consecutive summer days.
const DAY1 = new Date("2026-07-16T07:00:00.000Z");
const DAY2 = new Date("2026-07-17T07:00:00.000Z");

function row(
  source: BookingSource,
  status: BookingStatus,
  classStartAt = DAY1,
  depositMinor = 2000,
) {
  return { source, status, classStartAt, depositMinor };
}

describe("countsTowardTurnover", () => {
  it("card counts only after money settled (paid/attended/no_show)", () => {
    expect(countsTowardTurnover(row(BookingSource.card, BookingStatus.booked))).toBe(false);
    expect(countsTowardTurnover(row(BookingSource.card, BookingStatus.paid))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.card, BookingStatus.attended))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.card, BookingStatus.no_show))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.card, BookingStatus.cancelled))).toBe(false);
  });

  it("balance is debited at booking time — every live status counts", () => {
    expect(countsTowardTurnover(row(BookingSource.balance, BookingStatus.booked))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.balance, BookingStatus.attended))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.balance, BookingStatus.no_show))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.balance, BookingStatus.cancelled))).toBe(false);
  });

  it("onsite cash counts only once attendance is resolved", () => {
    expect(
      countsTowardTurnover(row(BookingSource.onsite_deposit, BookingStatus.pending_deposit)),
    ).toBe(false);
    expect(countsTowardTurnover(row(BookingSource.onsite_deposit, BookingStatus.attended))).toBe(true);
    expect(countsTowardTurnover(row(BookingSource.onsite_deposit, BookingStatus.no_show))).toBe(true);
  });
});

describe("dailyStats", () => {
  it("groups by Sofia day, newest first, and sums only settled deposits", () => {
    const days = dailyStats([
      row(BookingSource.card, BookingStatus.paid, DAY1),
      row(BookingSource.card, BookingStatus.booked, DAY1), // stale hold — no money
      row(BookingSource.onsite_deposit, BookingStatus.pending_deposit, DAY1),
      row(BookingSource.balance, BookingStatus.booked, DAY2, 1500),
      row(BookingSource.card, BookingStatus.no_show, DAY2),
      row(BookingSource.onsite_deposit, BookingStatus.attended, DAY2),
    ]);

    expect(days.map((d) => d.dayKey)).toEqual(["2026-07-17", "2026-07-16"]);

    const [day2, day1] = days;
    expect(day1.turnoverMinor).toBe(2000); // only the paid card booking
    expect(day1.bookings).toBe(3);
    expect(day2.turnoverMinor).toBe(1500 + 2000 + 2000);
    expect(day2.attended).toBe(1);
    expect(day2.noShows).toBe(1);
  });

  it("ignores cancelled rows entirely", () => {
    const days = dailyStats([row(BookingSource.balance, BookingStatus.cancelled)]);
    expect(days).toEqual([]);
  });
});
