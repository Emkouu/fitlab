/**
 * The month-end „усвоени депозити" report for the accountant.
 *
 * Same money as `/admin/stats/burned`, in the order a bookkeeper reads it:
 * oldest class first, one line per burn, the register key it belongs to, and
 * whether it has been rung up. The PDF (`burnedReportPdf.ts`) only lays this
 * out — every number in it comes from here, so it can be tested without
 * rendering a page.
 *
 * Amounts are `Booking.depositBurnedMinor`, never the current deposit setting
 * (see `burnedDeposits.ts`). A row fiscalized and since restored is a сторно,
 * listed apart with the amount that was printed, because the receipt exists
 * and the accountant has to see it reversed.
 */

import { burnReason, type BurnOriginKey, type BurnReason } from "./burnedDeposits";

export type BurnedReportInput = {
  id: string;
  status: string;
  depositBurnedMinor: number | null;
  depositBurnedMethod: BurnOriginKey | null;
  depositFiscalizedAt: Date | null;
  depositFiscalizedMinor: number | null;
  clientName: string | null;
  practiceName: string;
  classStartAt: Date;
};

export type BurnedReportLine = {
  id: string;
  classStartAt: Date;
  clientName: string;
  practiceName: string;
  reason: BurnReason;
  origin: BurnOriginKey;
  amountMinor: number;
  fiscalizedAt: Date | null;
};

type Group = { totalMinor: number; count: number };

export type BurnedReport = {
  /** Burns, oldest class first. */
  lines: BurnedReportLine[];
  /** Rung up, then restored — a receipt that needs a сторно. */
  storno: BurnedReportLine[];
  totalMinor: number;
  count: number;
  byOrigin: Record<BurnOriginKey, Group>;
  fiscalized: Group;
  pending: Group;
  stornoTotalMinor: number;
};

export const ORIGIN_ORDER: readonly BurnOriginKey[] = ["cash", "card", "manual", "unknown"];

export function buildBurnedReport(rows: readonly BurnedReportInput[]): BurnedReport {
  const lines: BurnedReportLine[] = [];
  const storno: BurnedReportLine[] = [];

  for (const r of rows) {
    const burned = r.depositBurnedMinor ?? 0;
    const base = {
      id: r.id,
      classStartAt: r.classStartAt,
      clientName: r.clientName?.trim() || "Без име",
      practiceName: r.practiceName,
      reason: burnReason(r.status),
      origin: r.depositBurnedMethod ?? "unknown",
      fiscalizedAt: r.depositFiscalizedAt,
    };
    if (burned > 0) {
      lines.push({ ...base, amountMinor: burned });
    } else if (r.depositFiscalizedAt) {
      storno.push({ ...base, amountMinor: r.depositFiscalizedMinor ?? 0 });
    }
  }

  const byStart = (a: BurnedReportLine, b: BurnedReportLine) =>
    a.classStartAt.getTime() - b.classStartAt.getTime() ||
    a.clientName.localeCompare(b.clientName, "bg");
  lines.sort(byStart);
  storno.sort(byStart);

  const byOrigin: Record<BurnOriginKey, Group> = {
    cash: { totalMinor: 0, count: 0 },
    card: { totalMinor: 0, count: 0 },
    manual: { totalMinor: 0, count: 0 },
    unknown: { totalMinor: 0, count: 0 },
  };
  const fiscalized: Group = { totalMinor: 0, count: 0 };
  const pending: Group = { totalMinor: 0, count: 0 };
  let totalMinor = 0;

  for (const l of lines) {
    totalMinor += l.amountMinor;
    byOrigin[l.origin].totalMinor += l.amountMinor;
    byOrigin[l.origin].count += 1;
    const bucket = l.fiscalizedAt ? fiscalized : pending;
    bucket.totalMinor += l.amountMinor;
    bucket.count += 1;
  }

  return {
    lines,
    storno,
    totalMinor,
    count: lines.length,
    byOrigin,
    fiscalized,
    pending,
    stornoTotalMinor: storno.reduce((s, l) => s + l.amountMinor, 0),
  };
}
