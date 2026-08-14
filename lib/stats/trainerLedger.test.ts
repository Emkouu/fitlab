import { describe, expect, it } from "vitest";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { classLedger, trainerLedger, trainerLedgerTotals } from "./trainerLedger";

const CLASS = { id: "c1", trainerIds: ["t1"], priceMinor: 1000 };

const booking = (
  status: BookingStatus,
  onsiteMethod: string | null = null,
  classId = "c1",
) => ({ classId, status, onsiteMethod });

/** The one trainer's entry, for the common single-trainer case. */
function only(entries: ReturnType<typeof trainerLedger>) {
  expect(entries).toHaveLength(1);
  return entries[0];
}

describe("trainerLedger", () => {
  it("counts classes taught even when nobody booked", () => {
    const e = only(trainerLedger({ classes: [CLASS], bookings: [] }));
    expect(e).toMatchObject({ trainerId: "t1", classes: 1, attended: 0 });
  });

  it("values cash at the class's own price", () => {
    const e = only(
      trainerLedger({
        classes: [{ ...CLASS, priceMinor: 1500 }],
        bookings: [booking(BookingStatus.attended, "cash")],
      }),
    );
    expect(e.cashMinor).toBe(1500);
    expect(e.byMethod.cash).toBe(1);
  });

  it("counts subscription and Multisport visits without valuing them", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [
          booking(BookingStatus.attended, "subscription"),
          booking(BookingStatus.attended, "multisport"),
        ],
      }),
    );
    expect(e.attended).toBe(2);
    expect(e.byMethod).toEqual({ subscription: 1, multisport: 1, cash: 0 });
    expect(e.cashMinor).toBe(0);
  });

  it("flags an attended booking with no recorded method", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [booking(BookingStatus.attended, null)],
      }),
    );
    expect(e).toMatchObject({ attended: 1, unrecorded: 1, cashMinor: 0 });
  });

  it("treats a legacy or unknown method as unrecorded rather than as cash", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [booking(BookingStatus.attended, "kesh")],
      }),
    );
    expect(e.unrecorded).toBe(1);
    expect(e.cashMinor).toBe(0);
  });

  it("separates a no-show from an unmarked booking", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [
          booking(BookingStatus.no_show),
          booking(BookingStatus.booked),
          booking(BookingStatus.paid),
          booking(BookingStatus.pending_deposit),
        ],
      }),
    );
    expect(e).toMatchObject({ noShows: 1, unmarked: 3, attended: 0 });
  });

  it("ignores cancelled bookings entirely", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [booking(BookingStatus.cancelled, "cash")],
      }),
    );
    expect(e).toMatchObject({
      attended: 0,
      noShows: 0,
      unmarked: 0,
      unrecorded: 0,
      cashMinor: 0,
    });
  });

  it("gives a two-trainer class in full to both, and says so in the totals", () => {
    const entries = trainerLedger({
      classes: [{ id: "c1", trainerIds: ["t1", "t2"], priceMinor: 1000 }],
      bookings: [booking(BookingStatus.attended, "cash")],
    });
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e).toMatchObject({ classes: 1, attended: 1, cashMinor: 1000 });
    }
    // Summing across trainers therefore double-counts — deliberate, and the
    // screen states it rather than hiding it behind an invented split.
    expect(trainerLedgerTotals(entries).cashMinor).toBe(2000);
  });

  it("keeps trainers apart when each teaches their own class", () => {
    const entries = trainerLedger({
      classes: [
        { id: "c1", trainerIds: ["t1"], priceMinor: 1000 },
        { id: "c2", trainerIds: ["t2"], priceMinor: 2000 },
      ],
      bookings: [
        booking(BookingStatus.attended, "cash", "c1"),
        booking(BookingStatus.attended, "cash", "c2"),
        booking(BookingStatus.attended, "cash", "c2"),
      ],
    });
    const t1 = entries.find((e) => e.trainerId === "t1");
    const t2 = entries.find((e) => e.trainerId === "t2");
    expect(t1?.cashMinor).toBe(1000);
    expect(t2?.cashMinor).toBe(4000);
  });

  it("drops a booking whose class is outside the period", () => {
    const e = only(
      trainerLedger({
        classes: [CLASS],
        bookings: [
          booking(BookingStatus.attended, "cash"),
          booking(BookingStatus.attended, "cash", "other-month"),
        ],
      }),
    );
    expect(e.attended).toBe(1);
    expect(e.cashMinor).toBe(1000);
  });

  it("leaves a class with no trainer out instead of inventing one", () => {
    const entries = trainerLedger({
      classes: [{ id: "c1", trainerIds: [], priceMinor: 1000 }],
      bookings: [booking(BookingStatus.attended, "cash")],
    });
    expect(entries).toEqual([]);
  });

  it("values a free class at nothing without losing the visit", () => {
    const e = only(
      trainerLedger({
        classes: [{ ...CLASS, priceMinor: 0 }],
        bookings: [booking(BookingStatus.attended, "cash")],
      }),
    );
    expect(e).toMatchObject({ attended: 1, cashMinor: 0 });
    expect(e.byMethod.cash).toBe(1);
  });
});

describe("classLedger", () => {
  it("counts by the same rules as the per-trainer view", () => {
    const classes = [{ id: "c1", trainerIds: ["t1"], priceMinor: 1000 }];
    const bookings = [
      booking(BookingStatus.attended, "cash"),
      booking(BookingStatus.attended, null),
      booking(BookingStatus.no_show),
      booking(BookingStatus.booked),
      booking(BookingStatus.cancelled, "cash"),
    ];
    const [perClass] = classLedger({ classes, bookings });
    const [perTrainer] = trainerLedger({ classes, bookings });

    expect(perClass.classId).toBe("c1");
    expect({
      attended: perClass.attended,
      noShows: perClass.noShows,
      unrecorded: perClass.unrecorded,
      unmarked: perClass.unmarked,
      cashMinor: perClass.cashMinor,
      byMethod: perClass.byMethod,
    }).toEqual({
      attended: perTrainer.attended,
      noShows: perTrainer.noShows,
      unrecorded: perTrainer.unrecorded,
      unmarked: perTrainer.unmarked,
      cashMinor: perTrainer.cashMinor,
      byMethod: perTrainer.byMethod,
    });
  });

  it("returns a row for a class nobody booked", () => {
    const [e] = classLedger({ classes: [CLASS], bookings: [] });
    expect(e).toMatchObject({ classId: "c1", attended: 0, cashMinor: 0 });
  });

  it("keeps a class with no trainer — the money still happened", () => {
    // Unlike the trainer view, which has nobody to attribute it to.
    const [e] = classLedger({
      classes: [{ id: "c1", trainerIds: [], priceMinor: 1000 }],
      bookings: [booking(BookingStatus.attended, "cash")],
    });
    expect(e.cashMinor).toBe(1000);
  });

  it("does not let one class's bookings leak into another", () => {
    const entries = classLedger({
      classes: [
        { id: "c1", trainerIds: ["t1"], priceMinor: 1000 },
        { id: "c2", trainerIds: ["t1"], priceMinor: 1000 },
      ],
      bookings: [booking(BookingStatus.attended, "cash", "c2")],
    });
    expect(entries.find((e) => e.classId === "c1")?.cashMinor).toBe(0);
    expect(entries.find((e) => e.classId === "c2")?.cashMinor).toBe(1000);
  });
});

describe("trainerLedgerTotals", () => {
  it("adds the columns that matter for the month", () => {
    const entries = trainerLedger({
      classes: [
        { id: "c1", trainerIds: ["t1"], priceMinor: 1000 },
        { id: "c2", trainerIds: ["t2"], priceMinor: 1000 },
      ],
      bookings: [
        booking(BookingStatus.attended, "cash", "c1"),
        booking(BookingStatus.attended, null, "c1"),
        booking(BookingStatus.no_show, null, "c2"),
        booking(BookingStatus.booked, null, "c2"),
      ],
    });
    expect(trainerLedgerTotals(entries)).toEqual({
      attended: 2,
      noShows: 1,
      unrecorded: 1,
      unmarked: 1,
      cashMinor: 1000,
    });
  });

  it("is zero for an empty ledger", () => {
    expect(trainerLedgerTotals([])).toEqual({
      attended: 0,
      noShows: 0,
      unrecorded: 0,
      unmarked: 0,
      cashMinor: 0,
    });
  });
});
