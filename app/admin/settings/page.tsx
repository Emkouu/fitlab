import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import { SettingsForm } from "./_components/SettingsForm";

export const metadata = { title: "FitLab Varna — Настройки" };

export default async function AdminSettingsPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
  });
  if (!studio) {
    throw new Error("Studio not found");
  }

  const initialData = {
    name: studio.name,
    address: studio.address ?? undefined,
    phone: studio.phone ?? undefined,
    facebookUrl: studio.facebookUrl ?? undefined,
    instagramUrl: studio.instagramUrl ?? undefined,
    cancelWindowHours: studio.cancelWindowHours,
    defaultDepositEur: (studio.defaultDeposit / 100).toFixed(2),
    defaultClassPriceEur: (studio.defaultClassPrice / 100).toFixed(2),
    cardPaymentsEnabled: studio.cardPaymentsEnabled,
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

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Настройки
        </h1>
      </div>

      <SettingsForm
        initialData={initialData}
        canEdit={admin.role === "super_admin"}
      />
    </main>
  );
}
