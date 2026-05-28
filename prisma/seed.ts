/**
 * FitLab MVP seed — catalog + 3 days of schedule, no bookings/payments.
 *
 * Re-runnable: every upsert keys on a stable natural id (slug / name /
 * (studioId, startAt, practiceId)). Dates are computed at run time so the
 * window is always "tomorrow + next two days in Europe/Sofia" — re-running
 * a week later inserts a fresh batch of upcoming classes.
 *
 * NOTE: `capacity` and `depositAmount` are NOT in the studio's real export.
 * The values below are PLACEHOLDERS so step 3 has something to render. The
 * owner MUST review and replace them with real per-class values before MVP
 * go-live. Money is in EUR everywhere: depositAmount holds EUR cents,
 * so 2000 = €20.00. Stripe will also be configured for EUR (step 7).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { sofiaCurrentWeekDates } from "../lib/format";

// Prisma 7's prisma-client provider takes a Driver Adapter, not a URL string.
// Migrations need the direct (non-pooled) connection; runtime app code uses
// DATABASE_URL (pooled) the same way with `connectionString: process.env.DATABASE_URL`.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ─── Time helpers (Europe/Sofia, DST-correct) ─────────────────────────────────

/**
 * Convert a "YYYY-MM-DD HH:mm" wall-clock string in Europe/Sofia to a UTC Date.
 * Uses Intl.DateTimeFormat to read Sofia's offset *at that specific instant*,
 * so it stays correct across DST transitions. No external library needed.
 */
function sofiaLocalToUtc(localISO: string): Date {
  const placeholder = new Date(`${localISO.replace(" ", "T")}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Sofia",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })
      .formatToParts(placeholder)
      .map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const sofiaWallAsUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = sofiaWallAsUtcMs - placeholder.getTime();
  return new Date(placeholder.getTime() - offsetMs);
}

/** Today's date in Europe/Sofia as "YYYY-MM-DD". */
function todaySofiaDate(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Sofia",
      year: "numeric", month: "2-digit", day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "YYYY-MM-DD" + n days, using UTC arithmetic (no TZ drift on plain dates). */
function addDays(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const STUDIO = {
  slug: "fitlab-varna",
  name: "FitLab Varna",
  cancelWindowHours: 4,
};

const PRACTICES = [
  { slug: "vinyasa-flow",       name: "Виняса Флоу" },
  { slug: "pilates",            name: "Пилатес" },
  { slug: "hatha-yoga",         name: "Хатха Йога" },
  { slug: "in-yoga",            name: "Ин Йога" },
  { slug: "terapevtichna-yoga", name: "Терапевтична Йога" },
  { slug: "tai-chi",            name: "Тай Чи" },
];

const TRAINERS = [
  { name: "Даниил", specialties: ["Виняса Флоу", "Хатха Йога"] },
  { name: "Юна",    specialties: ["Виняса Флоу", "Ин Йога"] },
  { name: "Мария",  specialties: ["Пилатес"] },
  { name: "Иван",   specialties: ["Хатха Йога", "Тай Чи"] },
  { name: "Елена",  specialties: ["Терапевтична Йога", "Ин Йога"] },
];

const DEFAULT_DEPOSIT_MINOR = 2000; // €20.00 placeholder; owner to confirm.

function pickCapacity(practiceSlug: string): number {
  if (practiceSlug === "terapevtichna-yoga") return 12;
  if (practiceSlug === "in-yoga" || practiceSlug === "tai-chi") return 14;
  return 18;
}

// ─── Schedule (7 days, anchored at "tomorrow Sofia") ──────────────────────────
// dayOffset: 0 = tomorrow, 6 = a week out. Re-runnable: any row that already
// exists at (studioId, startAt, practiceId) is updated in place.

type ScheduleRow = {
  dayOffset: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  localTime: string;          // "HH:mm" Sofia local
  durationMinutes: number;
  practiceSlug: string;
  trainerNames: string[];     // 1 or 2
  isSpecialEvent?: boolean;
  eventNotes?: string;
  /** Override DEFAULT_DEPOSIT_MINOR when a row has a special deposit. */
  depositAmountOverride?: number;
};

const SCHEDULE: ScheduleRow[] = [
  // Day 0 (tomorrow)
  { dayOffset: 0, localTime: "08:00", durationMinutes: 55,  practiceSlug: "vinyasa-flow",       trainerNames: ["Юна"] },
  { dayOffset: 0, localTime: "10:00", durationMinutes: 70,  practiceSlug: "pilates",            trainerNames: ["Мария"] },
  { dayOffset: 0, localTime: "18:00", durationMinutes: 90,  practiceSlug: "vinyasa-flow",       trainerNames: ["Даниил", "Юна"] }, // dual trainer
  { dayOffset: 0, localTime: "19:45", durationMinutes: 60,  practiceSlug: "in-yoga",            trainerNames: ["Елена"] },

  // Day 1
  { dayOffset: 1, localTime: "07:30", durationMinutes: 45,  practiceSlug: "hatha-yoga",         trainerNames: ["Иван"] },
  { dayOffset: 1, localTime: "12:00", durationMinutes: 55,  practiceSlug: "pilates",            trainerNames: ["Мария"] },
  {
    dayOffset: 1, localTime: "18:30", durationMinutes: 80,
    practiceSlug: "terapevtichna-yoga", trainerNames: ["Елена"],
    eventNotes: "Карти не важат — депозит 30 €.",
    depositAmountOverride: 3000, // €30.00 — must match the eventNotes.
  },
  { dayOffset: 1, localTime: "20:00", durationMinutes: 100, practiceSlug: "vinyasa-flow",       trainerNames: ["Даниил"] },

  // Day 2
  { dayOffset: 2, localTime: "09:00", durationMinutes: 55,  practiceSlug: "vinyasa-flow",       trainerNames: ["Юна"] },
  { dayOffset: 2, localTime: "11:00", durationMinutes: 70,  practiceSlug: "tai-chi",            trainerNames: ["Иван"] },
  {
    dayOffset: 2, localTime: "18:00", durationMinutes: 120, practiceSlug: "hatha-yoga",
    trainerNames: ["Даниил"], isSpecialEvent: true, eventNotes: "Workshop — смяна на зала",
  },
  { dayOffset: 2, localTime: "19:30", durationMinutes: 60,  practiceSlug: "in-yoga",            trainerNames: ["Елена"] },

  // Day 3
  { dayOffset: 3, localTime: "07:30", durationMinutes: 55,  practiceSlug: "hatha-yoga",         trainerNames: ["Иван"] },
  { dayOffset: 3, localTime: "10:00", durationMinutes: 70,  practiceSlug: "pilates",            trainerNames: ["Мария"] },
  { dayOffset: 3, localTime: "18:30", durationMinutes: 90,  practiceSlug: "vinyasa-flow",       trainerNames: ["Юна"] },
  { dayOffset: 3, localTime: "19:45", durationMinutes: 60,  practiceSlug: "in-yoga",            trainerNames: ["Елена"] },

  // Day 4
  { dayOffset: 4, localTime: "08:00", durationMinutes: 55,  practiceSlug: "vinyasa-flow",       trainerNames: ["Даниил"] },
  { dayOffset: 4, localTime: "11:00", durationMinutes: 70,  practiceSlug: "tai-chi",            trainerNames: ["Иван"] },
  { dayOffset: 4, localTime: "18:00", durationMinutes: 80,  practiceSlug: "terapevtichna-yoga", trainerNames: ["Елена"] },
  { dayOffset: 4, localTime: "20:00", durationMinutes: 60,  practiceSlug: "hatha-yoga",         trainerNames: ["Даниил"] },

  // Day 5 (weekend pace — fewer slots, longer sessions)
  { dayOffset: 5, localTime: "09:00", durationMinutes: 70,  practiceSlug: "vinyasa-flow",       trainerNames: ["Юна"] },
  { dayOffset: 5, localTime: "11:00", durationMinutes: 55,  practiceSlug: "pilates",            trainerNames: ["Мария"] },
  {
    dayOffset: 5, localTime: "12:30", durationMinutes: 90,  practiceSlug: "hatha-yoga",
    trainerNames: ["Иван"], isSpecialEvent: true, eventNotes: "Weekend дълга практика — 90 мин",
  },

  // Day 6
  { dayOffset: 6, localTime: "09:30", durationMinutes: 80,  practiceSlug: "in-yoga",            trainerNames: ["Елена"] },
  { dayOffset: 6, localTime: "11:00", durationMinutes: 90,  practiceSlug: "vinyasa-flow",       trainerNames: ["Даниил", "Юна"] }, // dual trainer
];

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  // Anchor on Monday of the current Sofia calendar week. dayOffset 0 = Mon,
  // 6 = Sun. Re-running mid-week therefore keeps the past part of the week
  // populated too, which Седмица needs to render past classes.
  const weekStart = sofiaCurrentWeekDates()[0];
  console.log(`Seeding 7 days of classes anchored at Sofia Monday ${weekStart}.`);

  const studio = await prisma.studio.upsert({
    where: { slug: STUDIO.slug },
    update: { name: STUDIO.name, cancelWindowHours: STUDIO.cancelWindowHours },
    create: STUDIO,
  });

  const practiceBySlug = new Map<string, { id: string; name: string }>();
  const practiceByName = new Map<string, { id: string; name: string }>();
  for (const p of PRACTICES) {
    const row = await prisma.practice.upsert({
      where: { slug: p.slug },
      update: { name: p.name },
      create: p,
    });
    practiceBySlug.set(p.slug, row);
    practiceByName.set(p.name, row);
  }

  const trainerByName = new Map<string, { id: string }>();
  for (const t of TRAINERS) {
    // Map specialty names to practice IDs
    const specialtyIds = t.specialties
      .map((name) => practiceByName.get(name)?.id)
      .filter((id) => id !== undefined) as string[];

    // No natural unique key on Trainer.name — look up first, create if missing.
    const existing = await prisma.trainer.findFirst({ where: { name: t.name } });
    const row = existing
      ? await prisma.trainer.update({
          where: { id: existing.id },
          data: {
            specialties: {
              set: specialtyIds.map((id) => ({ id })),
            },
          },
        })
      : await prisma.trainer.create({
          data: {
            name: t.name,
            specialties: {
              connect: specialtyIds.map((id) => ({ id })),
            },
          },
        });
    trainerByName.set(t.name, row);
  }

  let created = 0;
  let updated = 0;
  for (const row of SCHEDULE) {
    const practice = practiceBySlug.get(row.practiceSlug);
    if (!practice) throw new Error(`Unknown practice slug: ${row.practiceSlug}`);
    const trainerIds = row.trainerNames.map((n) => {
      const t = trainerByName.get(n);
      if (!t) throw new Error(`Unknown trainer: ${n}`);
      return { id: t.id };
    });

    const dateISO = addDays(weekStart, row.dayOffset);
    const startAt = sofiaLocalToUtc(`${dateISO} ${row.localTime}`);
    const data = {
      startAt,
      durationMinutes: row.durationMinutes,
      capacity: pickCapacity(row.practiceSlug),
      depositAmount: row.depositAmountOverride ?? DEFAULT_DEPOSIT_MINOR,
      isSpecialEvent: row.isSpecialEvent ?? false,
      eventNotes: row.eventNotes ?? null,
      practiceId: practice.id,
      studioId: studio.id,
    };

    // Natural key: same studio, same instant, same practice.
    const existing = await prisma.scheduledClass.findFirst({
      where: { studioId: studio.id, startAt, practiceId: practice.id },
    });

    if (existing) {
      await prisma.scheduledClass.update({
        where: { id: existing.id },
        data: { ...data, trainers: { set: trainerIds } },
      });
      updated++;
    } else {
      await prisma.scheduledClass.create({
        data: { ...data, trainers: { connect: trainerIds } },
      });
      created++;
    }
  }

  console.log(
    `Seed done: 1 studio, ${PRACTICES.length} practices, ${TRAINERS.length} trainers, ` +
    `${created} new classes, ${updated} updated. NO bookings/payments inserted.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
