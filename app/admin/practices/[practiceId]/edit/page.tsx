import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { PracticeForm } from "../../_components/PracticeForm";
import { AdminBreadcrumb } from "../../../_components/AdminBreadcrumb";

interface EditPageProps {
  params: Promise<{ practiceId: string }>;
}

export async function generateMetadata({ params }: EditPageProps) {
  const { practiceId } = await params;
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
  });
  return {
    title: practice
      ? `FitLab Varna — Редактиране на ${practice.name}`
      : "FitLab Varna — Редактиране на практика",
  };
}

export default async function AdminPracticesEditPage({ params }: EditPageProps) {
  const { practiceId } = await params;

  const admin = await getAdminUser();
  if (!admin) {
    redirect("/schedule");
  }

  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
  });
  if (!practice) {
    redirect("/admin/practices");
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

      <AdminBreadcrumb parentLabel="Практики" parentHref="/admin/practices" />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Редактиране на {practice.name}
        </h1>
      </div>

      <PracticeForm
        mode="edit"
        initialData={{
          id: practice.id,
          name: practice.name,
          slug: practice.slug,
        }}
      />
    </main>
  );
}
