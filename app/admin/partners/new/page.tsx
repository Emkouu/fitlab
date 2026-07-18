import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { PartnerForm } from "../_components/PartnerForm";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Добави партньор" };

export default async function AdminPartnersNewPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
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
          Добави партньор
        </h1>
      </div>

      <PartnerForm mode="create" />
    </main>
  );
}
