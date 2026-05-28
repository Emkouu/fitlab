import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { TrainerList } from "./_components/TrainerList";

export const metadata = { title: "FitLab Varna — Управление на треньори" };

export default async function AdminTrainersPage() {
  // ─── Role gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  // ─── Fetch all trainers with details ────────────────────────────────────
  const trainers = await prisma.trainer.findMany({
    include: {
      specialties: { select: { id: true, name: true } },
      user: { select: { id: true, email: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-7">
        <div className="flex items-center justify-between">
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
          <Link
            href="/admin"
            className="text-sm text-[color:var(--brand-purple)] hover:underline"
          >
            Назад
          </Link>
        </div>
      </header>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Управление на треньори
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          Всички треньори
        </p>
      </div>

      {/* Add Trainer Button */}
      <div className="mb-6">
        <Link
          href="/admin/trainers/new"
          className="block rounded-lg bg-[color:var(--brand-magenta)] px-5 py-3 text-center font-semibold text-white transition-all hover:opacity-90 shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)] hover:shadow-[0_8px_24px_-8px_rgba(236,72,153,0.35)]"
        >
          Добави треньор
        </Link>
      </div>

      {/* Trainer List */}
      <TrainerList trainers={trainers} />
    </main>
  );
}
