import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { PartnerForm } from "../../_components/PartnerForm";
import { AdminBreadcrumb } from "../../../_components/AdminBreadcrumb";

interface EditPageProps {
  params: Promise<{ partnerId: string }>;
}

export async function generateMetadata({ params }: EditPageProps) {
  const { partnerId } = await params;
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });
  return {
    title: partner
      ? `FitLab Varna — Редактиране на ${partner.name}`
      : "FitLab Varna — Редактиране на партньор",
  };
}

export default async function AdminPartnersEditPage({ params }: EditPageProps) {
  const { partnerId } = await params;

  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });
  if (!partner) {
    redirect("/admin/partners");
  }

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

      <AdminBreadcrumb parentLabel="Партньори" parentHref="/admin/partners" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Редактиране на {partner.name}
        </h1>
      </div>

      <PartnerForm
        mode="edit"
        initialData={{
          id: partner.id,
          name: partner.name,
          description: partner.description,
          logoUrl: partner.logoUrl,
          siteUrl: partner.siteUrl,
          promoCode: partner.promoCode,
          active: partner.active,
        }}
      />
    </main>
  );
}
