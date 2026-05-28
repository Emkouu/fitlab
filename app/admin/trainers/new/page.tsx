import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { TrainerFormPage } from "../_components/TrainerFormPage";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Добави треньор" };

export default async function AdminTrainersNewPage() {
  // ─── Role gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  // ─── Fetch all practices and available users (trainerId = null) ──────────
  const [practices, availableUsersRaw] = await Promise.all([
    prisma.practice.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        trainerId: null,
        email: { not: null },
      },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  // Type assertion: we know email is not null due to the where clause
  const availableUsers = availableUsersRaw.map((u) => ({
    id: u.id,
    email: u.email!,
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
      </header>

      <AdminBreadcrumb parentLabel="Треньори" parentHref="/admin/trainers" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Добави треньор
        </h1>
      </div>

      <TrainerFormPage
        mode="create"
        practices={practices}
        availableUsers={availableUsers}
      />
    </main>
  );
}
