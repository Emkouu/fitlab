import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import {
  formatEurMinor,
  formatSofiaDateTime,
  formatSofiaDay,
  formatSofiaTime,
} from "@/lib/format";
import { ACQUIRER, COMPANY, siteOrigin } from "@/lib/legal/company";
import { classPriceMinor } from "@/lib/pricing";
import { PrintButton } from "./_components/PrintButton";

export const metadata = {
  title: "FitLab Varna — Електронна разписка",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Electronic receipt for a successful card transaction.
 *
 * The field list is not a design choice — the acquirer prescribes it
 * (Fibank instruction §I.15): merchant name, the site's web address, a
 * description of the service, transaction date, transaction value, a unique
 * order reference, the client's name, and the delivery address. For a service
 * performed on the premises the "delivery address" is the studio, which is where
 * the class is held.
 *
 * The same data goes out by email (`emails/BookingConfirmation.tsx`) so the
 * client keeps a copy without depending on this page, and both are retained for
 * at least 13 months (§III.2).
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/receipt/${bookingId}`)}`);

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, role: true, fullName: true, email: true },
  });
  if (!profile) redirect("/schedule");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      user: { select: { id: true, fullName: true, email: true } },
      scheduledClass: {
        include: {
          practice: { select: { name: true, priceMinor: true } },
          trainers: { orderBy: { name: "asc" }, select: { name: true } },
          studio: {
            select: { name: true, address: true, phone: true, defaultClassPrice: true },
          },
        },
      },
    },
  });

  // A receipt belongs to its client. Staff can pull it up for support.
  const isStaff =
    profile.role === "admin" || profile.role === "super_admin" || profile.role === "coach";
  if (!booking || (booking.userId !== profile.id && !isStaff)) notFound();

  const payment = booking.payment;
  const cls = booking.scheduledClass;
  const paid = payment?.status === PaymentStatus.paid;
  const refunded = payment?.status === PaymentStatus.refunded;

  const clientName = booking.user.fullName ?? booking.user.email ?? "—";
  const studioAddress = cls.studio.address ?? "гр. Варна";
  const classPrice = classPriceMinor(cls.practice, cls.studio);
  // Transaction date = when the money moved, not when the row was created.
  const transactionDate = paid || refunded ? (payment?.updatedAt ?? booking.createdAt) : booking.createdAt;

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-6 font-sans text-[color:var(--brand-ink)] md:max-w-2xl print:max-w-none">
      <header className="mb-6">
        <div className="flex items-center justify-center">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Image
              src="/logo.png"
              alt={COMPANY.brand}
              width={180}
              height={90}
              priority
              className="h-14 w-auto"
            />
          </Link>
        </div>
        <h1 className="mt-5 text-center font-display text-xl font-bold tracking-tight">
          Електронна разписка
        </h1>
        {paid && (
          <p className="mt-1 text-center font-display text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Успешно плащане
          </p>
        )}
        {refunded && (
          <p className="mt-1 text-center font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]">
            Възстановена сума
          </p>
        )}
        {!paid && !refunded && (
          <p className="mt-1 text-center font-display text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Плащането не е потвърдено
          </p>
        )}
      </header>

      <section className="rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)] print:border-neutral-300 print:shadow-none">
        <dl className="space-y-2.5">
          <Row label="Търговец" value={`${COMPANY.legalName}, ЕИК ${COMPANY.eik}`} />
          <Row label="Търговско наименование" value={COMPANY.brand} />
          <Row label="Седалище" value={COMPANY.seat} />
          <Row label="Интернет адрес" value={siteOrigin().replace(/^https?:\/\//, "")} />
          <Row label="Имейл" value={COMPANY.email} />
          {cls.studio.phone && <Row label="Телефон" value={cls.studio.phone} />}

          <Divider />

          <Row label="Номер на поръчката" value={booking.id} mono />
          <Row label="Дата на транзакцията" value={formatSofiaDateTime(transactionDate)} />
          <Row label="Клиент" value={clientName} />

          <Divider />

          <Row
            label="Описание на услугата"
            value={`Депозит за запазване на място — ${cls.practice.name}`}
          />
          <Row
            label="Клас"
            value={`${formatSofiaDay(cls.startAt)}, ${formatSofiaTime(cls.startAt)} · ${cls.durationMinutes} мин${
              cls.trainers.length > 0
                ? ` · с ${cls.trainers.map((t) => t.name).join(" & ")}`
                : ""
            }`}
          />
          <Row
            label="Място на изпълнение"
            value={`${cls.studio.name}, ${studioAddress}`}
          />

          <Divider />

          <Row
            label="Стойност на транзакцията"
            value={payment ? `${formatEurMinor(payment.amount)} (${payment.currency})` : "—"}
            emphasis
          />
          {payment?.ecommCardMask && <Row label="Карта" value={payment.ecommCardMask} mono />}
          {payment?.ecommRrn && <Row label="RRN" value={payment.ecommRrn} mono />}
          {payment?.ecommApprovalCode && (
            <Row label="Код на одобрение" value={payment.ecommApprovalCode} mono />
          )}
          {refunded && payment?.refundedAt && (
            <Row
              label="Възстановена сума"
              value={`${formatEurMinor(payment.refundedAmount ?? payment.amount)} на ${formatSofiaDateTime(payment.refundedAt)} — по същата карта`}
            />
          )}
        </dl>

        <p className="mt-5 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 px-4 py-3 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/80">
          Депозитът е <strong>еднократен</strong> и остава по профила ти за
          следващи резервации. Цената на самата тренировка е{" "}
          <strong>{formatEurMinor(classPrice)}</strong> и се заплаща на място.
          Всички суми са крайни и в евро (EUR).
        </p>

        <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--brand-purple)]/75">
          Плащането е обработено през {ACQUIRER.productDefinite} на{" "}
          {ACQUIRER.name}. <strong>Запази или отпечатай тази разписка</strong> —
          тя е доказателството ти за направената поръчка. Копие получаваш и на
          имейл.
        </p>

        <div className="mt-5 space-y-2.5 print:hidden">
          <PrintButton />
          <Link
            href="/account"
            className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
          >
            Към резервациите ми
          </Link>
        </div>
      </section>

      <p className="mt-5 text-center text-[11px] text-[color:var(--brand-purple)]/55 print:mt-3">
        Условия за отказ и възстановяване:{" "}
        <Link href="/policies#terms" className="font-semibold hover:underline">
          Общи условия
        </Link>
        {" · "}
        <Link href="/policies#payments" className="font-semibold hover:underline">
          Плащания и депозити
        </Link>
      </p>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60 sm:w-48 sm:shrink-0">
        {label}
      </dt>
      <dd
        className={[
          "leading-relaxed",
          emphasis
            ? "font-display text-base font-bold text-[color:var(--brand-magenta)]"
            : "text-sm text-[color:var(--brand-ink)]/85",
          mono ? "font-mono text-[12px] break-all" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function Divider() {
  return <div className="!mt-4 border-t border-[color:var(--brand-pink)]/40 pt-1" />;
}
