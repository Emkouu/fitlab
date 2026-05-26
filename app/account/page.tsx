import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { SignOutButton } from "./_components/SignOutButton";

// Middleware already guards /account, but defence in depth: server-side re-check.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  // The FitLab User row should always exist by the time we get here (the
  // callback syncs it), but fall back gracefully if it doesn't.
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, email: true, phone: true, role: true, createdAt: true },
  });

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-8">
        <div className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="FitLab Varna"
            width={180}
            height={90}
            priority
            className="h-16 w-auto"
          />
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Профил</h1>
        <p className="mt-2 text-sm text-[color:var(--brand-purple)]/70">
          Влязъл/а си във FitLab Varna.
        </p>
      </div>

      <dl className="mb-6 space-y-2 rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <Row label="Имейл" value={profile?.email ?? user.email ?? "—"} />
        <Row label="Телефон" value={profile?.phone ?? "—"} />
        <Row label="Роля" value={profile?.role ?? "member"} mono />
      </dl>

      <div className="space-y-3">
        <Link
          href="/schedule"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
        >
          Към графика
        </Link>
        <SignOutButton />
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-[color:var(--brand-purple)]/45">
        Резервациите и плащанията се появяват тук в следваща стъпка.
      </p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-sm ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
