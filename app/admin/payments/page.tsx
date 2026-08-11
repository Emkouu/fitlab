import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { AdminBreadcrumb } from "../_components/AdminBreadcrumb";
import { CardTransactions } from "../_components/CardTransactions";
import {
  CARD_TRANSACTION_INCLUDE,
  toCardTransactionGroup,
  type CardTransactionGroupView,
} from "../_components/cardTransactionView";

export const dynamic = "force-dynamic";

export const metadata = { title: "FitLab Varna — Картови плащания" };

/**
 * Every card transaction through the virtual POS, searchable by the identifiers
 * the acquirer uses.
 *
 * The bank's questions arrive as „what do you have recorded for TrnID X" — so
 * the search matches `TrnID`, RRN and approval code, and it looks inside the
 * superseded attempts too: a declined card is retried on a fresh transaction,
 * and the one the bank is asking about is often no longer the row's current one.
 */

/** How many payment rows we scan. A single studio stays far below this. */
const SCAN_LIMIT = 500;
/** How many groups we render at once. */
const PAGE_SIZE = 100;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  // Card transactions are financial data — admins only, no coaches.
  const admin = await getAdminUser();
  if (!admin) redirect("/schedule");

  const query = ((await searchParams)?.q ?? "").trim();

  const payments = await prisma.payment.findMany({
    where: { ecommTransId: { not: null } },
    include: CARD_TRANSACTION_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
  });

  const allGroups = payments.map((p) =>
    toCardTransactionGroup(p, { withClient: true }),
  );
  const matched = query === "" ? allGroups : allGroups.filter((g) => matches(g, query));
  const groups = matched.slice(0, PAGE_SIZE);

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-7">
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

      <AdminBreadcrumb parentLabel="Admin" parentHref="/admin" />

      <div className="mb-4 mt-2 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Картови плащания
        </h1>
        <span className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          {matched.length}
        </span>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[color:var(--brand-purple)]/70">
        Всяка транзакция през виртуалния ПОС, включително заменените опити при
        повторно плащане. Търси по TrnID, RRN или approval code.
      </p>

      {/* Plain GET form: the query lives in the URL, so a search can be shared. */}
      <form method="get" className="mb-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="TrnID, RRN или approval code"
          aria-label="Търсене по TrnID, RRN или approval code"
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30"
        />
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--brand-magenta)] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
        >
          Търси
        </button>
      </form>

      <CardTransactions
        groups={groups}
        emptyText={
          query === ""
            ? "Още няма картови транзакции."
            : `Няма транзакция, отговаряща на „${query}".`
        }
      />

      {matched.length > groups.length && (
        <p className="mt-4 text-xs text-[color:var(--brand-purple)]/70">
          Показани са първите {groups.length} от {matched.length}. Уточни
          търсенето, за да стигнеш до конкретна транзакция.
        </p>
      )}
      {query === "" && payments.length === SCAN_LIMIT && (
        <p className="mt-2 text-xs text-[color:var(--brand-purple)]/60">
          Прегледани са последните {SCAN_LIMIT} плащания.
        </p>
      )}
    </main>
  );
}

/**
 * Case-insensitive match across the identifiers the bank quotes, plus the client
 * name — staff also arrive here from „кой е платил това".
 *
 * `TrnID` values are base64 and often pasted with their trailing `=`, so the
 * comparison is a plain substring, not a token match.
 */
function matches(group: CardTransactionGroupView, query: string): boolean {
  const needle = query.toLowerCase();
  const haystack = [
    group.clientLabel,
    group.classText,
    ...group.attempts.flatMap((a) => [
      a.transId,
      a.rrn,
      a.approvalCode,
      a.cardMask,
    ]),
  ];
  return haystack.some((v) => v !== null && v.toLowerCase().includes(needle));
}
