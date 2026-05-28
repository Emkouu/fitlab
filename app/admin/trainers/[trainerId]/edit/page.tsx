import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { TrainerFormPage } from "../../_components/TrainerFormPage";

interface EditPageProps {
  params: Promise<{ trainerId: string }>;
}

export async function generateMetadata({ params }: EditPageProps) {
  const { trainerId } = await params;
  const trainer = await prisma.trainer.findUnique({ where: { id: trainerId } });
  return {
    title: trainer
      ? `FitLab Varna — Редактиране на ${trainer.name}`
      : "FitLab Varna — Редактиране на треньор",
  };
}

export default async function AdminTrainersEditPage({ params }: EditPageProps) {
  // ─── Resolve params ──────────────────────────────────────────────────────
  const { trainerId } = await params;

  // ─── Role gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  // ─── Fetch trainer with details ──────────────────────────────────────────
  const trainer = await prisma.trainer.findUnique({
    where: { id: trainerId },
    include: {
      specialties: { select: { id: true, name: true } },
      user: { select: { id: true, email: true } },
    },
  });

  // ─── If trainer not found, redirect ──────────────────────────────────────
  if (!trainer) {
    redirect("/admin/trainers");
  }

  const userFilters: Array<{ trainerId: null } | { id: string }> = [
    { trainerId: null },
  ];
  if (trainer.user) {
    userFilters.push({ id: trainer.user.id });
  }

  // ─── Fetch all practices and available users ────────────────────────────
  // Include both unlinked users AND the current linked user (if any)
  // Filter for users with non-null email
  const [practices, availableUsersRaw] = await Promise.all([
    prisma.practice.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        email: { not: null },
        OR: userFilters,
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

  // ─── Transform trainer data for form ─────────────────────────────────────
  const initialData = {
    id: trainer.id,
    name: trainer.name,
    photoUrl: trainer.photoUrl,
    bio: trainer.bio,
    specialties: trainer.specialties,
    linkedUserId: trainer.user?.id || null,
  };

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
            href="/admin/trainers"
            className="text-sm text-[color:var(--brand-purple)] hover:underline"
          >
            Назад
          </Link>
        </div>
      </header>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Редактиране на {trainer.name}
        </h1>
      </div>

      <TrainerFormPage
        mode="edit"
        initialData={initialData}
        practices={practices}
        availableUsers={availableUsers}
      />
    </main>
  );
}
