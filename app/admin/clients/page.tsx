import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { ClientList, type ClientRow } from "./_components/ClientList";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Клиенти" };

export default async function AdminClientsPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

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

      <Link
        href="/admin"
        className="mb-3 inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70 hover:text-[color:var(--brand-magenta)]"
      >
        ← Admin
      </Link>

      <div className="mb-5 mt-2 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Клиенти
        </h1>
        <span className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          {rows.length}
        </span>
      </div>

      <ClientList rows={rows} />
    </main>
  );
}
