import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { PracticeForm } from "../_components/PracticeForm";

export const metadata = { title: "FitLab Varna — Добави практика" };

export default async function AdminPracticesNewPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

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
            href="/admin/practices"
            className="text-sm text-[color:var(--brand-purple)] hover:underline"
          >
            Назад
          </Link>
        </div>
      </header>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Добави практика
        </h1>
      </div>

      <PracticeForm mode="create" />
    </main>
  );
}
