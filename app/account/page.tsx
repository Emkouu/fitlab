import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { formatEurMinor } from "@/lib/format";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { SignOutButton } from "./_components/SignOutButton";
import { BookingsList } from "./_components/BookingsList";
import { PaymentHistory } from "./_components/PaymentHistory";
import { PartnerPerks } from "./_components/PartnerPerks";

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
    select: { id: true, email: true, phone: true, fullName: true, role: true, createdAt: true, depositBalance: true },
  });

  // Fetch bookings with all related data
  const bookings = await prisma.booking.findMany({
    where: { userId: profile?.id },
    include: {
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          trainers: { orderBy: { name: "asc" }, select: { id: true, name: true } },
          studio: { select: { name: true, cancelWindowHours: true } },
        },
      },
      payment: { select: { id: true, amount: true, currency: true, status: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Split bookings into upcoming and past, excluding cancelled
  const now = Date.now();
  const upcomingBookings = bookings.filter((b) => {
    const startTime = new Date(b.scheduledClass.startAt).getTime();
    return startTime > now && b.status !== "cancelled";
  });
  const pastBookings = bookings.filter((b) => {
    const startTime = new Date(b.scheduledClass.startAt).getTime();
    return startTime <= now;
  });

  // Loyalty-program partners (admin-managed at /admin/partners).
  const partners = await prisma.partner.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      siteUrl: true,
      promoCode: true,
    },
  });

  // Fetch all payments for this user (via their bookings)
  const payments = await prisma.payment.findMany({
    where: {
      booking: {
        userId: profile?.id,
      },
    },
    include: {
      booking: {
        select: {
          scheduledClass: {
            select: {
              practice: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

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
        <Breadcrumb current="Профил" />
      </header>

      <div className="mb-6">
        {profile?.fullName && (
          <p className="mb-1 font-display text-lg font-bold text-[color:var(--brand-magenta)]">
            Здравей, {profile.fullName.split(" ")[0]}! 👋
          </p>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight">Профил</h1>
        <p className="mt-2 text-sm text-[color:var(--brand-purple)]/70">
          Влязъл/а си във FitLab Varna.
        </p>
      </div>

      <dl className="mb-8 space-y-2 rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <Row label="Име" value={profile?.fullName ?? "—"} />
        <Row label="Имейл" value={profile?.email ?? user.email ?? "—"} />
        <Row label="Телефон" value={profile?.phone ?? "—"} />
        <Row label="Роля" value={profile?.role ?? "member"} mono />
        {profile?.depositBalance !== undefined && (
          <Row 
            label="Баланс" 
            value={formatEurMinor(profile.depositBalance)} 
            mono 
          />
        )}
      </dl>

      {(profile?.role === "admin" ||
        profile?.role === "super_admin" ||
        profile?.role === "coach") && (
        <Link
          href="/admin"
          className="mb-8 flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-[color:var(--brand-magenta)] bg-white px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
        >
          {profile.role === "coach" ? "Треньорски панел →" : "Админ панел →"}
        </Link>
      )}

      {/* Bookings section — always rendered so the empty state can guide
          new users to the schedule. */}
      <div className="mb-8">
        <h2 className="mb-4 font-display text-lg font-bold tracking-tight">
          Резервации
        </h2>
        <BookingsList
          upcomingBookings={upcomingBookings}
          pastBookings={pastBookings}
        />
      </div>

      {/* Payment history section */}
      {payments.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 font-display text-lg font-bold tracking-tight">
            История на плащания
          </h2>
          <PaymentHistory payments={payments} />
        </div>
      )}

      {/* Loyalty program — partner brands with discount codes */}
      {partners.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-1 font-display text-lg font-bold tracking-tight">
            Лоялна програма
          </h2>
          <p className="mb-4 text-xs text-[color:var(--brand-purple)]/70">
            Отстъпки от нашите партньори — само за клиенти на FitLab.
          </p>
          <PartnerPerks partners={partners} />
        </div>
      )}

      <div className="space-y-3">
        <Link
          href="/schedule"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
        >
          Към графика
        </Link>
        <SignOutButton />
      </div>
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
