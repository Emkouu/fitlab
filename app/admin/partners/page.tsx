import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { PartnerList } from "./_components/PartnerList";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Лоялна програма" };

type AdminPartnersPageProps = {
  searchParams?: Promise<{ success?: string }>;
};

export default async function AdminPartnersPage({
  searchParams,
}: AdminPartnersPageProps) {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const showSavedToast =
    resolvedSearchParams.success === "created" ||
    resolvedSearchParams.success === "updated";

  const partners = await prisma.partner.findMany({
    orderBy: { name: "asc" },
  });

  const rows = partners.map((p) => ({
    id: p.id,
    name: p.name,
    logoUrl: p.logoUrl,
    siteUrl: p.siteUrl,
    promoCode: p.promoCode,
    active: p.active,
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
      </header>

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Лоялна програма
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          Партньорски брандове с отстъпки — показват се в профила на клиентите
        </p>
      </div>

      {showSavedToast && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          Партньорът е запазен
        </div>
      )}

      <div className="mb-6">
        <Link
          href="/admin/partners/new"
          className="block rounded-lg bg-[color:var(--brand-magenta)] px-5 py-3 text-center font-semibold text-white transition-all hover:opacity-90 shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)] hover:shadow-[0_8px_24px_-8px_rgba(236,72,153,0.35)]"
        >
          Добави партньор
        </Link>
      </div>

      <PartnerList partners={rows} isSuperAdmin={admin.role === "super_admin"} />
    </main>
  );
}
