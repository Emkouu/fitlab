import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ClassFormPage } from "../../_components/ClassFormPage";
import { AdminBreadcrumb } from "../../../_components/AdminBreadcrumb";
import { formatSofiaTime, sofiaDateKey } from "@/lib/format";
import type { ClassFormInput } from "@/lib/validation/classForm";

export const metadata = { title: "FitLab Varna — Редактирай клас" };

interface EditPageProps {
  params: Promise<{ classId: string }>;
}

export default async function AdminScheduleEditPage({ params }: EditPageProps) {
  // ─── Resolve params ──────────────────────────────────────────────────────
  const { classId } = await params;

  // ─── Role gate (parent already guards, but double-check) ──────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  // ─── Fetch class with all details ────────────────────────────────────────
  const scheduledClass = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      practice: { select: { id: true, name: true } },
      trainers: { select: { id: true, name: true } },
    },
  });

  // ─── If class not found, redirect ────────────────────────────────────────
  if (!scheduledClass) {
    redirect("/admin/schedule");
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

  // ─── Transform class data to ClassFormInput format ───────────────────────
  const initialData: ClassFormInput & { id: string } = {
    id: scheduledClass.id,
    classId: scheduledClass.id,
    // Convert UTC startAt to Sofia local date for display
    // sofiaDateKey returns "YYYY-MM-DD" which is already in Sofia timezone
    date: new Date(`${sofiaDateKey(scheduledClass.startAt)}T00:00:00Z`),
    // Format time in Sofia timezone (e.g., "18:30")
    time: formatSofiaTime(scheduledClass.startAt),
    duration: scheduledClass.durationMinutes.toString() as
      | "45"
      | "55"
      | "60"
      | "70"
      | "80"
      | "90"
      | "100"
      | "120",
    practiceId: scheduledClass.practiceId,
    trainerIds: scheduledClass.trainers.map((t) => t.id),
    capacity: scheduledClass.capacity,
    // Convert cents to EUR string (e.g., 2000 -> "20.00")
    depositEur: (scheduledClass.depositAmount / 100).toFixed(2),
    isSpecialEvent: scheduledClass.isSpecialEvent,
    eventNotes: scheduledClass.eventNotes || "",
  };

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
          Редактирай клас
        </h1>
      </div>

      <ClassFormPage
        mode="edit"
        practices={practices}
        trainers={trainers}
        initialData={initialData}
      />
    </main>
  );
}
