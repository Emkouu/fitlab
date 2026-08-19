import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { PaymentStatus, BookingStatus, Role } from "@/lib/generated/prisma/enums";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { formatSofiaDay, formatSofiaTime } from "@/lib/format";
import {
  AttendancePanel,
  type AttendanceRow,
} from "../_components/AttendancePanel";
import {
  AddClientToClass,
  type ClientOption,
} from "../_components/AddClientToClass";
import { isUnfinishedCardDeposit } from "@/lib/booking/unfinishedDeposit";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Присъствия по клас" };

export default async function AdminAttendanceClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  const admin = await getStaffUser();
  if (!admin) redirect("/schedule");

  const cls = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      practice: { select: { name: true } },
      trainers: { select: { id: true, name: true } },
      studio: { select: { name: true } },
      bookings: {
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
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              depositBalance: true,
            },
          },
          payment: { select: { status: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!cls) notFound();

  // Clients available to add to this class (search list for the „+").
  const allClients = await prisma.user.findMany({
    select: { id: true, fullName: true, phone: true, email: true },
    orderBy: { fullName: "asc" },
    take: 1000,
  });
  const clientOptions: ClientOption[] = allClients.map((u) => ({
    id: u.id,
    name: u.fullName ?? u.email ?? u.phone ?? "—",
    contact: u.phone ?? u.email ?? "",
  }));
  const enrolledIds = cls.bookings.map((b) => b.userId);

  // Deposit management is a financial action → admins only, not coaches.
  const canManageDeposits = admin.role !== Role.coach;

  const rows: AttendanceRow[] = cls.bookings.map((b) => ({
    id: b.id,
    userId: b.user.id,
    status: b.status,
    source: b.source,
    who: b.user.fullName ?? b.user.email ?? b.user.phone ?? "—",
    depositMinor: b.user.depositBalance,
    cardPaid:
      b.source === "card" &&
      (b.payment?.status === PaymentStatus.paid ||
        b.status === BookingStatus.paid),
    onsiteMethod: b.onsiteMethod,
    depositSettled: b.depositSettledAt !== null,
    isFirstVisit: b.isFirstVisit,
    // A card hold whose deposit never arrived. Kept out of „Записани" so the
    // number staff read is the number of people who actually booked.
    unfinishedDeposit: isUnfinishedCardDeposit({
      source: b.source,
      status: b.status,
      paymentStatus: b.payment?.status ?? null,
    }),
  }));

  const enrolled = rows.filter((r) => !r.unfinishedDeposit);
  const unfinished = rows.filter((r) => r.unfinishedDeposit);

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

      <AdminBreadcrumb
        parentLabel="Присъствия"
        parentHref="/admin/attendance"
      />

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

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
          Записани ({enrolled.length})
        </h2>
        <AddClientToClass
          classId={cls.id}
          clients={clientOptions}
          enrolledIds={enrolledIds}
        />
      </div>

      <AttendancePanel rows={enrolled} canManageDeposits={canManageDeposits} />

      {/* Card holds whose deposit never arrived. Separate, because they are not
          people the studio should expect in the room — and because counting
          them as „записани" made the class look fuller than it was. */}
      {unfinished.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 font-display text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Недовършени плащания на депозит ({unfinished.length})
          </h2>
          <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--brand-purple)]/60">
            Стигнали са до страницата за плащане с карта, но депозитът не е
            платен. Не се броят към записаните. Мястото се освобождава
            автоматично, ако друг клиент запази същия клас след 15 минути.
          </p>
          <AttendancePanel
            rows={unfinished}
            canManageDeposits={canManageDeposits}
          />
        </section>
      )}
    </main>
  );
}
