import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking";
import Image from "next/image";
import Link from "next/link";
import { AdminScheduleSurface } from "./_components/AdminScheduleSurface";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Admin Schedule" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function AdminSchedulePage() {
  // ─── Role gate ──────────────────────────────────────────────────────────
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(Date.now() + THIRTY_DAYS_MS);

  // ─── Look up studio by slug (not hardcoded ID) ─────────────────────────
  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
  });
  if (!studio) {
    throw new Error("Studio not found");
  }

  // ─── Fetch all upcoming classes (7–30 days) ─────────────────────────────
  const classes = await prisma.scheduledClass.findMany({
    where: {
      studioId: studio.id,
      startAt: { gte: now, lte: thirtyDaysFromNow },
    },
    include: {
      practice: true,
      trainers: { orderBy: { name: "asc" }, select: { name: true, id: true } },
      _count: {
        select: {
          bookings: {
            where: { status: { in: ACTIVE_BOOKING_STATUSES } },
          },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });

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
      </header>

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          График за управление
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          Следващите 30 дни
        </p>
      </div>

      <AdminScheduleSurface classes={classes} />
    </main>
  );
}
