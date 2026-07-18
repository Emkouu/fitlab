import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { Role } from "@/lib/generated/prisma/enums";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { ClientList, type ClientRow } from "./_components/ClientList";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Клиенти" };

type AdminClientsPageProps = {
  searchParams?: Promise<{ success?: string }>;
};

export default async function AdminClientsPage({
  searchParams,
}: AdminClientsPageProps) {
  // Admins manage clients; coaches can view the list and add new ones.
  const admin = await getStaffUser();
  if (!admin) redirect("/schedule");
  const isCoach = admin.role === Role.coach;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const showCreatedToast = resolvedSearchParams.success === "created";

  const users = await prisma.user.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      depositBalance: true,
      createdAt: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const rows: ClientRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    depositBalance: u.depositBalance,
    bookingsCount: u._count.bookings,
    createdAt: u.createdAt.toISOString(),
  }));

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
          Клиенти
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
            {rows.length}
          </span>
          {/* „+" — add a client (available to coaches too) */}
          <Link
            href="/admin/clients/new"
            aria-label="Добави клиент"
            title="Добави клиент"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand-magenta)] font-display text-xl font-bold leading-none text-white shadow-[0_4px_12px_-6px_rgba(236,72,153,0.6)] transition-all hover:scale-105 hover:bg-[color:var(--brand-purple)]"
          >
            +
          </Link>
        </div>
      </div>

      {showCreatedToast && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          Клиентът е добавен
        </div>
      )}

      <ClientList rows={rows} canOpenDetail={!isCoach} />
    </main>
  );
}
