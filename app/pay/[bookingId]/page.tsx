import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { formatEurMinor, formatSofiaDay, formatSofiaTime } from "@/lib/format";
import { ecommClientUrl } from "@/lib/payments/ecomm/config";
import { ACQUIRER, COMPANY } from "@/lib/legal/company";
import { PaymentLogos } from "@/app/_components/PaymentLogos";
import { EcommRedirectForm } from "./_components/EcommRedirectForm";

export const metadata = {
  title: "FitLab Varna — Плащане",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The hop between „Потвърди" and the bank's card-entry page.
 *
 * Fibank requires the client to reach ClientHandler by POST carrying
 * `trans_id`, so this page exists purely to hold that form and submit it. It
 * also does the last honest thing we owe the client before card data is asked
 * for: repeat the exact amount, name the merchant, and name the bank whose page
 * they are about to land on (acquirer instruction §I.8 — the price must be
 * visible at every step that confirms a transaction).
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/pay/${bookingId}`)}`);

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) redirect("/schedule");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      scheduledClass: {
        include: {
          practice: { select: { name: true } },
          studio: { select: { name: true } },
        },
      },
    },
  });

  // A booking is only ever payable by its owner.
  if (!booking || booking.userId !== profile.id) notFound();

  if (booking.payment?.status === PaymentStatus.paid) {
    redirect(`/receipt/${booking.id}`);
  }
  if (!booking.payment?.ecommTransId || booking.payment.status !== PaymentStatus.pending) {
    // Nothing registered (or a stale failed attempt) — send them back to pick
    // a payment method again rather than POST a dead transaction id.
    redirect("/schedule?payment=restart");
  }

  const cls = booking.scheduledClass;

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-8 font-sans text-[color:var(--brand-ink)]">
      <div className="flex items-center justify-center">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Image src="/logo.png" alt={COMPANY.brand} width={180} height={90} priority className="h-14 w-auto" />
        </Link>
      </div>

      <section className="mt-8 rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)]">
        <h1 className="font-display text-lg font-bold tracking-tight text-[color:var(--brand-purple)]">
          Пренасочваме те към банката
        </h1>

        <dl className="mt-4 space-y-2 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 p-4">
          <Row label="Услуга" value={`Депозит — ${cls.practice.name}`} />
          <Row
            label="Клас"
            value={`${formatSofiaDay(cls.startAt)}, ${formatSofiaTime(cls.startAt)} · ${cls.studio.name}`}
          />
          <Row label="Сума за плащане" value={formatEurMinor(booking.payment.amount)} emphasis />
          <Row label="Търговец" value={`${COMPANY.legalName}, ЕИК ${COMPANY.eik}`} />
        </dl>

        <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/80">
          Данните на картата се въвеждат на защитената страница на{" "}
          <strong>{ACQUIRER.name}</strong> и не преминават през нашия сайт.
          Плащането е защитено с {ACQUIRER.authentication}.
        </p>

        <div className="mt-4">
          <EcommRedirectForm
            actionUrl={ecommClientUrl()}
            transId={booking.payment.ecommTransId}
            bookingId={booking.id}
          />
        </div>

        <div className="mt-5 text-center">
          <PaymentLogos />
        </div>

        <p className="mt-5 text-center text-[11px] text-[color:var(--brand-purple)]/55">
          Сумата е крайна и е в евро (EUR). Виж{" "}
          <Link href="/policies#terms" className="font-semibold text-[color:var(--brand-magenta)] hover:underline">
            Общите условия
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60 sm:w-36 sm:shrink-0">
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? "font-display text-base font-bold text-[color:var(--brand-magenta)]"
            : "text-sm leading-relaxed text-[color:var(--brand-ink)]/85"
        }
      >
        {value}
      </dd>
    </div>
  );
}
