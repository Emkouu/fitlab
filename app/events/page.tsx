import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import {
  formatSofiaDay,
  formatSofiaTime,
  formatEurMinor,
} from "@/lib/format";
import { DEPOSIT_UNIT_MINOR } from "@/lib/deposit";
import { Heartbeat } from "@/app/_components/Heartbeat";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Събития" };

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
  BookingStatus.attended,
];

/**
 * „Събития" — public list of special events (isSpecialEvent classes) coming
 * up. Same booking model as regular classes, but each card leads with a promo
 * photo. Booking reuses the schedule flow via ?openBooking=<id>.
 */
export default async function EventsPage() {
  const events = await prisma.scheduledClass.findMany({
    where: {
      isSpecialEvent: true,
      cancelledAt: null,
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    include: {
      practice: { select: { name: true, description: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      studio: { select: { name: true } },
      _count: {
        select: { bookings: { where: { status: { in: ACTIVE_STATUSES } } } },
      },
    },
    take: 100,
  });

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-6">
        <div className="flex items-center justify-center">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Image
              src="/logo.png"
              alt="FitLab Varna"
              width={180}
              height={90}
              priority
              className="h-16 w-auto"
            />
          </Link>
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[color:var(--brand-magenta)]">
          Събития
        </h1>
        <Link
          href="/schedule"
          className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60 transition-colors hover:text-[color:var(--brand-magenta)]"
        >
          График →
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--brand-pink)]/60 bg-white/60 px-5 py-10 text-center text-sm text-[color:var(--brand-purple)]/65">
          Няма предстоящи събития в момента.
        </div>
      ) : (
        <ul className="space-y-5">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </ul>
      )}
    </main>
  );
}

type EventRow = {
  id: string;
  startAt: Date;
  durationMinutes: number;
  capacity: number;
  eventNotes: string | null;
  imageUrl: string | null;
  practice: { name: string; description: string | null };
  trainers: { name: string }[];
  studio: { name: string };
  _count: { bookings: number };
};

function EventCard({ event }: { event: EventRow }) {
  const remaining = event.capacity - event._count.bookings;
  const full = remaining <= 0;

  return (
    <li className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(123,45,142,0.05),0_10px_30px_-12px_rgba(236,72,153,0.3)]">
      {/* Promo photo above the event */}
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={event.practice.name}
          className="h-44 w-full object-cover"
        />
      )}

      <div className="px-5 py-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          {formatSofiaDay(event.startAt)}
        </p>
        <p className="mt-1 font-display text-xl font-bold leading-tight text-[color:var(--brand-magenta)]">
          {formatSofiaTime(event.startAt)}
          <span className="ml-2 font-mono text-xs uppercase tracking-wider text-[color:var(--brand-purple)]/55">
            · {event.durationMinutes} мин
          </span>
        </p>
        <h2 className="mt-2 font-display text-lg font-bold leading-tight tracking-tight">
          {event.practice.name}
        </h2>
        <p className="text-sm text-[color:var(--brand-purple)]/75">
          {event.trainers.map((t) => t.name).join(" & ") || "—"} ·{" "}
          {event.studio.name}
        </p>

        {event.eventNotes && (
          <p className="mt-3 whitespace-pre-line rounded-2xl bg-[color:var(--brand-pink-soft)]/60 px-3.5 py-3 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/85">
            {event.eventNotes}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
            Депозит {formatEurMinor(DEPOSIT_UNIT_MINOR)}
            {!full && (
              <span className="ml-2 text-[color:var(--brand-purple)]/45">
                · {remaining} места
              </span>
            )}
          </span>
          {full ? (
            <span className="rounded-2xl bg-[color:var(--brand-pink-soft)] px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
              Няма места
            </span>
          ) : (
            <Link
              href={`/schedule?openBooking=${encodeURIComponent(event.id)}`}
              className="rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
            >
              Запази място
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
