import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { BookingStatus, BookingSource } from "@/lib/generated/prisma/enums";
import { createBooking, cancelBooking, markAttendance } from "./engine";

/**
 * Integration tests for the booking engine. They run against the REAL
 * Supabase Postgres via DIRECT_URL — there is no faking of atomicity.
 * The race test relies on a real row-level lock contending under
 * Promise.all.
 *
 * Every row this file creates is tracked and cleaned up in afterAll so
 * a re-run is safe. We never touch the seeded FitLab Varna catalog rows.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const createdUserIds = new Set<string>();
const createdClassIds = new Set<string>();

let testStudioId: string;
let testPracticeId: string;

const TEST_STUDIO_SLUG = "fitlab-booking-engine-tests";
const TEST_PRACTICE_SLUG = "test-practice-be";

/* ───────────────────────────── fixtures ───────────────────────────── */

async function makeUser(suffix = ""): Promise<string> {
  // Email must be unique; generate a fresh one per call.
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`;
  const u = await prisma.user.create({
    data: {
      email: `be-test+${tag}@fitlab.dev`,
      role: "member",
    },
  });
  createdUserIds.add(u.id);
  return u.id;
}

async function makeClass(opts: {
  capacity?: number;
  hoursFromNow?: number;
} = {}): Promise<string> {
  const capacity = opts.capacity ?? 10;
  const hoursFromNow = opts.hoursFromNow ?? 48;
  const c = await prisma.scheduledClass.create({
    data: {
      startAt: new Date(Date.now() + hoursFromNow * 3_600_000),
      durationMinutes: 60,
      capacity,
      depositAmount: 2000,
      practiceId: testPracticeId,
      studioId: testStudioId,
    },
  });
  createdClassIds.add(c.id);
  return c.id;
}

beforeAll(async () => {
  const studio = await prisma.studio.upsert({
    where: { slug: TEST_STUDIO_SLUG },
    update: {},
    create: {
      slug: TEST_STUDIO_SLUG,
      name: "FitLab Booking-Engine Tests",
      // 24h is the SPEC default; tests anchor "late" cancels under this.
      cancelWindowHours: 24,
    },
  });
  testStudioId = studio.id;

  const practice = await prisma.practice.upsert({
    where: { slug: TEST_PRACTICE_SLUG },
    update: {},
    create: { slug: TEST_PRACTICE_SLUG, name: "Test Practice (BE)" },
  });
  testPracticeId = practice.id;
});

afterAll(async () => {
  // Delete in FK order: Booking → ScheduledClass → User.
  // Bookings created by any of our test users OR on any of our test classes.
  if (createdUserIds.size > 0 || createdClassIds.size > 0) {
    await prisma.booking.deleteMany({
      where: {
        OR: [
          { userId: { in: Array.from(createdUserIds) } },
          { scheduledClassId: { in: Array.from(createdClassIds) } },
        ],
      },
    });
  }
  if (createdClassIds.size > 0) {
    await prisma.scheduledClass.deleteMany({
      where: { id: { in: Array.from(createdClassIds) } },
    });
  }
  if (createdUserIds.size > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: Array.from(createdUserIds) } },
    });
  }
  // Leave the test Studio + Practice; cheap to reuse next run.
  await prisma.$disconnect();
});

/* ───────────────────────────── tests ───────────────────────────── */

describe("booking engine", () => {
  it("creates a card booking with status `booked`", async () => {
    const classId = await makeClass({ capacity: 10 });
    const userId = await makeUser();
    const r = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.booking.status).toBe(BookingStatus.booked);
      expect(r.booking.source).toBe(BookingSource.card);
    }
  });

  it("creates an on-site booking with status `pending_deposit`", async () => {
    const classId = await makeClass({ capacity: 10 });
    const userId = await makeUser();
    const r = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.onsite_deposit,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.booking.status).toBe(BookingStatus.pending_deposit);
      expect(r.booking.source).toBe(BookingSource.onsite_deposit);
    }
  });

  it("rejects a booking when the class is already full", async () => {
    const classId = await makeClass({ capacity: 1 });
    const u1 = await makeUser();
    const u2 = await makeUser();

    const r1 = await createBooking(prisma, {
      userId: u1,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);

    const r2 = await createBooking(prisma, {
      userId: u2,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.reason).toBe("full");
      expect(r2.message).toContain("пълен");
    }
  });

  it("rejects a duplicate booking by the same user on the same class", async () => {
    const classId = await makeClass({ capacity: 10 });
    const userId = await makeUser();

    const r1 = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);

    const r2 = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.onsite_deposit,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.reason).toBe("duplicate");
      // SPEC §5.2 phrasing; the engine sentence-cases it for UI.
      expect(r2.message.toLowerCase()).toContain("вече си записан");
    }
  });

  it("serializes two concurrent bookings on the last spot — only one wins", async () => {
    const classId = await makeClass({ capacity: 1 });
    const u1 = await makeUser();
    const u2 = await makeUser();

    const [r1, r2] = await Promise.all([
      createBooking(prisma, {
        userId: u1,
        scheduledClassId: classId,
        source: BookingSource.card,
      }),
      createBooking(prisma, {
        userId: u2,
        scheduledClassId: classId,
        source: BookingSource.card,
      }),
    ]);

    const wins = [r1, r2].filter((r) => r.ok).length;
    const fulls = [r1, r2].filter((r) => !r.ok && r.reason === "full").length;

    expect(wins).toBe(1);
    expect(fulls).toBe(1);

    // And the DB really only has one active booking for that class.
    const active = await prisma.booking.count({
      where: {
        scheduledClassId: classId,
        status: {
          in: [
            BookingStatus.booked,
            BookingStatus.pending_deposit,
            BookingStatus.paid,
            BookingStatus.attended,
          ],
        },
      },
    });
    expect(active).toBe(1);
  });

  it("cancel inside the window — deposit safe + spot freed", async () => {
    // Class starts 48h from now; window is 24h, so cancelling now is clean.
    const classId = await makeClass({ capacity: 1, hoursFromNow: 48 });
    const u1 = await makeUser();

    const r1 = await createBooking(prisma, {
      userId: u1,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const cancel = await cancelBooking(prisma, r1.booking.id);
    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.depositForfeited).toBe(false);

    // Booking row updated.
    const updated = await prisma.booking.findUnique({
      where: { id: r1.booking.id },
      select: { status: true, cancelledAt: true },
    });
    expect(updated?.status).toBe(BookingStatus.cancelled);
    expect(updated?.cancelledAt).not.toBeNull();

    // Spot freed: a different user can now grab the last seat.
    const u2 = await makeUser();
    const r2 = await createBooking(prisma, {
      userId: u2,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r2.ok).toBe(true);
  });

  it("cancel after the window — deposit forfeited", async () => {
    // Class starts in 1h; window is 24h → cancellation is "late".
    const classId = await makeClass({ capacity: 5, hoursFromNow: 1 });
    const userId = await makeUser();

    const r1 = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const cancel = await cancelBooking(prisma, r1.booking.id);
    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.depositForfeited).toBe(true);

    const updated = await prisma.booking.findUnique({
      where: { id: r1.booking.id },
      select: { status: true },
    });
    expect(updated?.status).toBe(BookingStatus.cancelled);
  });

  it("no_show burns the deposit and writes the no_show status", async () => {
    const classId = await makeClass({ capacity: 5 });
    const userId = await makeUser();

    const r1 = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const a = await markAttendance(prisma, r1.booking.id, "no_show");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.depositBurned).toBe(true);

    const updated = await prisma.booking.findUnique({
      where: { id: r1.booking.id },
      select: { status: true },
    });
    expect(updated?.status).toBe(BookingStatus.no_show);
  });

  it("attended does not burn the deposit", async () => {
    const classId = await makeClass({ capacity: 5 });
    const userId = await makeUser();

    const r1 = await createBooking(prisma, {
      userId,
      scheduledClassId: classId,
      source: BookingSource.card,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const a = await markAttendance(prisma, r1.booking.id, "attended");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.depositBurned).toBe(false);
  });
});
