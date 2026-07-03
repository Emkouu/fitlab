import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safeNext";
import { prisma } from "@/lib/db";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { OnboardingForm } from "./_components/OnboardingForm";

export const metadata = {
  title: "FitLab Varna — Добре дошли",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { fullName: true, phone: true },
  });

  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  if (profile?.fullName && profile.fullName.trim() !== "") {
    redirect(next);
  }

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-8">
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
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      <div className="mb-7 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Добре дошли! 👋
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
          Преди да продължиш, кажи ни малко за себе си.
        </p>
      </div>

      <OnboardingForm next={next} initialPhone={profile?.phone ?? ""} />
    </main>
  );
}
