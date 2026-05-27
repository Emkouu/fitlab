import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { Role, PaymentStatus, BookingStatus } from "@/lib/generated/prisma/enums";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import {
  AttendancePanel,
  type AttendanceRow,
} from "../_components/AttendancePanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Присъствия по клас" };

export default async function StaffClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  const staff = await getStaffUser();
  if (!staff) redirect("/schedule");

  const cls = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      practice: { select: { name: true } },
      trainers: { select: { id: true, name: true } },
      studio: { select: { name: true } },
      bookings: {
        // Show every active or already-marked row. Cancelled bookings
        // intentionally hidden — they free the spot per SPEC.
        where: {
          status: {
            in: [
              BookingStatus.booked,
              BookingStatus.pending_deposit,
              BookingStatus.paid,
              BookingStatus.attended,
              BookingStatus.no_show,
            ],
          },
        },
        include: {
          user: { select: { email: true, phone: true } },
          payment: { select: { status: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!cls) notFound();

  // Coach ownership check — admins skip.
  if (staff.role === Role.coach) {
    const isOwn = cls.trainers.some((t) => t.id === staff.trainerId);
    if (!isOwn) redirect("/staff");
  }

  const rows: AttendanceRow[] = cls.bookings.map((b) => ({
    id: b.id,
    status: b.status,
    source: b.source,
    who: b.user.email ?? b.user.phone ?? "—",
    cardPaid:
      b.source === "card" &&
      (b.payment?.status === PaymentStatus.paid ||
        b.status === BookingStatus.paid),
  }));

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-6">
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

      <Link
        href="/staff"
        className="mb-3 inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70 hover:text-[color:var(--brand-magenta)]"
      >
        ← Всички класове
      </Link>

      <section className="mb-5 rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          {formatSofiaDay(cls.startAt)}
        </p>
        <p className="mt-1 font-display text-xl font-bold leading-tight text-[color:var(--brand-magenta)]">
          {formatSofiaTime(cls.startAt)}
          <span className="ml-2 font-mono text-xs uppercase tracking-wider text-[color:var(--brand-purple)]/55">
            · {cls.durationMinutes} мин
          </span>
        </p>
        <h1 className="mt-2 font-display text-lg font-bold leading-tight tracking-tight">
          {cls.practice.name}
        </h1>
        <p className="text-sm text-[color:var(--brand-purple)]/75">
          {cls.trainers.map((t) => t.name).join(" & ") || "—"} · {cls.studio.name}
        </p>
      </section>

      <h2 className="mb-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
        Записани ({rows.length})
      </h2>

      <AttendancePanel rows={rows} />
    </main>
  );
}
