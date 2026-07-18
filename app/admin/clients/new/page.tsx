import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffUser } from "@/lib/auth/getStaffUser";
import { AddClientForm } from "../_components/AddClientForm";
import { AdminBreadcrumb } from "../../_components/AdminBreadcrumb";

export const metadata = { title: "FitLab Varna — Добави клиент" };

export default async function AdminClientsNewPage() {
  // Coaches can add clients too — the action re-checks the role server-side.
  const staff = await getStaffUser();
  if (!staff) {
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

      <AdminBreadcrumb parentLabel="Клиенти" parentHref="/admin/clients" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Добави клиент
        </h1>
        <p className="mt-1 text-xs text-[color:var(--brand-purple)]/70">
          Клиентът се създава веднага; профилът се свързва автоматично при
          първия му вход.
        </p>
      </div>

      <AddClientForm />
    </main>
  );
}
