import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { BookingStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { ClientDetail } from "../_components/ClientDetail";
import { DepositRefundPanel } from "../_components/DepositRefundPanel";
import { depositAmountMinor } from "@/lib/deposit";
import { formatSofiaDateTime } from "@/lib/format";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Клиент" };

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      bookings: {
        include: {
          payment: true,
          scheduledClass: {
            include: {
              practice: { select: { name: true } },
              trainers: { select: { id: true, name: true } },
              studio: {
                select: {
                  name: true,
                  cancelWindowHours: true,
                  defaultDeposit: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  // Stats
  const attended = user.bookings.filter(
    (b) => b.status === BookingStatus.attended,
  ).length;
  const noShows = user.bookings.filter(
    (b) => b.status === BookingStatus.no_show,
  ).length;
  const cancelledByUser = user.bookings.filter(
    (b) => b.status === BookingStatus.cancelled,
  ).length;

  // Total spend = sum of deposit amounts on bookings that were actually paid
  // (paid, attended, or no_show — money landed and stayed with the studio).
  const totalSpendMinor = user.bookings.reduce((sum, b) => {
    if (
      b.status === BookingStatus.paid ||
      b.status === BookingStatus.attended ||
      b.status === BookingStatus.no_show
    ) {
      return (
        sum +
        depositAmountMinor(b.scheduledClass, b.scheduledClass.studio)
      );
    }
    return sum;
  }, 0);

  // Card transactions we could send money back through: paid, not yet refunded,
  // and carrying an ECOMM identifier (the only thing the bank can reverse).
  const refundablePayments = user.bookings
    .map((b) => b.payment)
    .filter(
      (p): p is NonNullable<typeof p> =>
        p !== null && p.status === PaymentStatus.paid && p.ecommTransId !== null,
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => ({
      id: p.id,
      amount: p.amount,
      cardMask: p.ecommCardMask,
      dateText: formatSofiaDateTime(p.createdAt),
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

      <AdminBreadcrumb parentLabel="Клиенти" parentHref="/admin/clients" />

      <ClientDetail
        user={{
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          depositBalance: user.depositBalance,
          createdAt: user.createdAt.toISOString(),
        }}
        callerIsSelf={user.id === admin.id}
        callerIsSuperAdmin={admin.role === "super_admin"}
        stats={{
          attended,
          noShows,
          cancelledByUser,
          totalSpendMinor,
        }}
        bookings={user.bookings.map((b) => ({
          id: b.id,
          status: b.status,
          source: b.source,
          depositMinor: depositAmountMinor(
            b.scheduledClass,
            b.scheduledClass.studio,
          ),
          startAt: b.scheduledClass.startAt.toISOString(),
          durationMinutes: b.scheduledClass.durationMinutes,
          practiceName: b.scheduledClass.practice.name,
          studioName: b.scheduledClass.studio.name,
          trainers: b.scheduledClass.trainers.map((t) => t.name),
        }))}
      />

      <DepositRefundPanel
        userId={user.id}
        depositBalance={user.depositBalance}

        canRefund={admin.role === "super_admin"}
        refundablePayments={refundablePayments}
      />
    </main>
  );
}
