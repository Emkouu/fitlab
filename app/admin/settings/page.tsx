import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import { SettingsForm } from "./_components/SettingsForm";
import { SystemSettingsAccordion } from "./_components/SystemSettingsAccordion";
import { EmailSettingsForm } from "./_components/EmailSettingsForm";
import { emailSettingsView } from "@/lib/email/settings";
import { formatSofiaDateTime } from "@/lib/format";

export const metadata = { title: "FitLab Varna — Настройки" };

/** Collapsed-state hint, so the accordion says where mail goes без да се отваря. */
const TRANSPORT_NOTE: Record<string, string> = {
  resend: "Resend",
  none: "не е настроено",
};

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

  const email = await emailSettingsView();

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

      {/* Infrastructure knobs, folded away — see SystemSettingsAccordion. */}
      <div className="mt-10">
        <SystemSettingsAccordion
          summaryNote={`Изпращане на имейли · ${TRANSPORT_NOTE[email.activeTransport]}`}
        >
          <h2 className="mb-4 font-display text-base font-bold text-[color:var(--brand-purple)]">
            Изпращане на имейли
          </h2>
          <EmailSettingsForm
            initialData={{
              fromName: email.fromName || undefined,
              fromEmail: email.fromEmail || undefined,
              replyTo: email.replyTo || undefined,
            }}
            activeTransport={email.activeTransport}
            effectiveFrom={email.effectiveFrom}
            resendConfigured={email.resendConfigured}
            updatedAtText={
              email.updatedAt ? formatSofiaDateTime(email.updatedAt) : null
            }
            updatedByEmail={email.updatedByEmail}
            testEmailDefault={admin.email ?? ""}
            canEdit={admin.role === "super_admin"}
          />
        </SystemSettingsAccordion>
      </div>
    </main>
  );
}
