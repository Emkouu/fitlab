import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { BookingStatus } from "@/lib/generated/prisma/enums";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Присъствия" };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const UNMARKED_STATUSES = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
];

export default async function AdminAttendanceIndexPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

  const now = new Date();
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

  const classes = await prisma.scheduledClass.findMany({
    where: { startAt: { gte: cutoff, lt: now } },
    include: {
      practice: { select: { name: true } },
      trainers: { orderBy: { name: "asc" }, select: { name: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } },
        },
      },
    },
    orderBy: { startAt: "desc" },
    take: 60,
  });

  const byClass = await Promise.all(
    classes.map(async (c) => {
      const unmarked = await prisma.booking.count({
        where: { scheduledClassId: c.id, status: { in: UNMARKED_STATUSES } },
      });
      return { ...c, unmarked };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-7">
        <div className="flex items-center justify-center">
          <Link href="/" className="hover:opacity-80 transition-opacity">
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

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-5 mt-2 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Присъствия
        </h1>
      </div>

      <p className="mb-5 text-sm text-[color:var(--brand-purple)]/70">
        Всички приключили класове в последните 7 дни.
      </p>

      {byClass.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {byClass.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/attendance/${c.id}`}
                className="block overflow-hidden rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] transition-shadow hover:shadow-[0_1px_2px_rgba(123,45,142,0.06),0_8px_24px_-8px_rgba(236,72,153,0.28)]"
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
                    {formatSofiaDay(c.startAt)}
                  </span>
                  <span className="font-display text-sm font-bold text-[color:var(--brand-magenta)]">
                    {formatSofiaTime(c.startAt)}
                  </span>
                </div>
                <h3 className="font-display text-[15px] font-semibold leading-tight">
                  {c.practice.name}
                </h3>
                <p className="mt-1 truncate text-sm text-[color:var(--brand-purple)]/75">
                  {c.trainers.map((t) => t.name).join(" & ") || "—"}
                </p>
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="text-[color:var(--brand-purple)]/60">
                    {c._count.bookings} записани
                  </span>
                  {c.unmarked > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-[color:var(--brand-magenta)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
                      {c.unmarked} необработени
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
                      Готово
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
      <p className="font-display text-base font-semibold">Няма класове</p>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
        В последните 7 дни няма приключили класове за обработка.
      </p>
    </div>
  );
}
