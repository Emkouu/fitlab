import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ClassFormPage } from "../_components/ClassFormPage";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Добави нов клас" };

export default async function AdminScheduleNewPage() {
  // ─── Role gate (parent already guards, but double-check) ──────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  // ─── Fetch all practices and trainers ────────────────────────────────────
  const [practices, trainers] = await Promise.all([
    prisma.practice.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.trainer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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

      <AdminBreadcrumb parentLabel="График" parentHref="/admin/schedule" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Добави нов клас
        </h1>
      </div>

      <ClassFormPage
        mode="create"
        practices={practices}
        trainers={trainers}
      />
    </main>
  );
}
