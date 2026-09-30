import "server-only";
import pdfmake from "pdfmake";
import robotoFonts from "pdfmake/fonts/Roboto";
import { COMPANY } from "@/lib/legal/company";
import { formatEurMinor, formatSofiaDateTime } from "@/lib/format";
import { BURN_REASON_LABEL, type BurnOriginKey } from "./burnedDeposits";
import { ORIGIN_ORDER, type BurnedReport, type BurnedReportLine } from "./burnedReport";
import { formatMonthKeyBg } from "./monthRange";

/**
 * Lays out `BurnedReport` as an A4 PDF for the accountant — the month's burned
 * deposits, split by the key they are rung up on (в брой / с карта), then every
 * burn line by line. No numbers are computed here; see `burnedReport.ts`.
 *
 * Roboto ships inside pdfmake and covers Cyrillic, so no font lives in the repo.
 * `pdfmake` is a `serverExternalPackages` entry, which keeps the font paths it
 * exports pointing at real files in node_modules.
 */

const ORIGIN_LABEL: Record<BurnOriginKey, string> = {
  cash: "В брой",
  card: "С карта",
  manual: "Ръчна корекция",
  unknown: "Неизвестен произход",
};

const DATE = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Intl puts narrow/no-break spaces in money and dates; plain ones render the
// same and never fall outside the embedded font.
const plain = (s: string) => s.replace(/[  ]/g, " ");
const eur = (minor: number) => plain(formatEurMinor(minor));
const date = (d: Date) => plain(DATE.format(d)).replace(/\s*г\.$/, "");
const time = (d: Date) => plain(TIME.format(d));

const INK = "#2b1a33";
const MUTED = "#7a6a80";
const RULE = "#e6d9ea";

const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
  vLineWidth: () => 0,
  hLineColor: () => RULE,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 4,
  paddingRight: () => 4,
};

function detailTable(lines: BurnedReportLine[], storno = false) {
  const head = ["№", "Дата", "Час", "Клиент", "Практика", "Основание", "Каса", "Сума", "Чукнат на"].map(
    (text, i) => ({ text, style: "th", alignment: i === 7 ? "right" : "left" }),
  );
  const body = lines.map((l, i) => [
    { text: String(i + 1), color: MUTED },
    date(l.classStartAt),
    time(l.classStartAt),
    l.clientName,
    l.practiceName,
    storno ? "Върнат след чукане" : BURN_REASON_LABEL[l.reason],
    l.origin === "unknown" ? "Неизвестен" : ORIGIN_LABEL[l.origin],
    { text: (storno ? "−" : "") + eur(l.amountMinor), alignment: "right", bold: true },
    l.fiscalizedAt ? date(l.fiscalizedAt) : { text: "не е чукнат", color: "#c0392b" },
  ]);
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [14, 46, 26, "*", "*", 58, 46, 44, 50],
      body: [head, ...body],
    },
    layout: tableLayout,
    fontSize: 8,
  };
}

export async function renderBurnedReportPdf(
  report: BurnedReport,
  monthKey: string,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  pdfmake.setFonts(robotoFonts);
  // Only the bundled fonts may be read from disk, and nothing from the network.
  const fontFiles = new Set(Object.values(robotoFonts).flatMap((f) => Object.values(f)));
  pdfmake.setLocalAccessPolicy((p: string) => fontFiles.has(p));
  pdfmake.setUrlAccessPolicy(() => false);

  const monthLabel = formatMonthKeyBg(monthKey);

  const summaryRows = ORIGIN_ORDER.filter((k) => report.byOrigin[k].count > 0).map((k) => [
    ORIGIN_LABEL[k],
    { text: String(report.byOrigin[k].count), alignment: "right" },
    { text: eur(report.byOrigin[k].totalMinor), alignment: "right", bold: true },
  ]);

  const content: unknown[] = [
    { text: `${COMPANY.legalName} · ЕИК ${COMPANY.eik}`, style: "company" },
    { text: `${COMPANY.brand} · ${COMPANY.seat}`, style: "muted" },
    { text: "Справка за усвоени депозити", style: "title" },
    { text: `за месец ${monthLabel} г.`, style: "subtitle" },
    {
      text:
        "Усвоеният депозит е приход на студиото (неявяване или отказ след срока) и се маркира " +
        "на касовия апарат според начина, по който клиентът го е платил. Периодът е по датата на класа.",
      style: "muted",
      margin: [0, 0, 0, 10],
    },
    { text: "Обобщение по вид плащане", style: "h2" },
  ];

  if (report.count === 0) {
    content.push({ text: `През ${monthLabel} г. няма усвоени депозити.`, margin: [0, 2, 0, 10] });
  } else {
    content.push({
      table: {
        headerRows: 1,
        widths: ["*", 50, 80],
        body: [
          [
            { text: "Вид плащане (каса)", style: "th" },
            { text: "Брой", style: "th", alignment: "right" },
            { text: "Сума", style: "th", alignment: "right" },
          ],
          ...summaryRows,
          [
            { text: "Общо усвоени", bold: true },
            { text: String(report.count), alignment: "right", bold: true },
            { text: eur(report.totalMinor), alignment: "right", bold: true },
          ],
        ],
      },
      layout: tableLayout,
      fontSize: 9.5,
      margin: [0, 0, 0, 6],
    });
    content.push({
      columns: [
        { text: `Чукнати на касата: ${report.fiscalized.count} бр. · ${eur(report.fiscalized.totalMinor)}`, style: "muted" },
        {
          text: `Нечукнати: ${report.pending.count} бр. · ${eur(report.pending.totalMinor)}`,
          style: "muted",
          alignment: "right",
          color: report.pending.count > 0 ? "#c0392b" : MUTED,
        },
      ],
      margin: [0, 0, 0, 14],
    });
    content.push({ text: "Подробно", style: "h2" }, detailTable(report.lines));
  }

  if (report.storno.length > 0) {
    content.push(
      { text: "За сторниране", style: "h2", margin: [0, 16, 0, 2] },
      {
        text:
          "Депозити, чукнати на касата и върнати на клиента след това (поправено „не дойде“). " +
          "Касовата бележка съществува и подлежи на сторно.",
        style: "muted",
        margin: [0, 0, 0, 6],
      },
      detailTable(report.storno, true),
      {
        text: `Общо за сторно: −${eur(report.stornoTotalMinor)}`,
        alignment: "right",
        bold: true,
        fontSize: 9,
        margin: [0, 4, 0, 0],
      },
    );
  }

  if (report.byOrigin.unknown.count > 0) {
    content.push({
      text:
        "„Неизвестен произход“ — депозит, записан преди системата да пази начина на плащане. " +
        "Начинът трябва да се сверява с клиентския профил.",
      style: "muted",
      margin: [0, 10, 0, 0],
    });
  }

  const doc = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 44],
    info: {
      title: `Усвоени депозити — ${monthLabel}`,
      author: COMPANY.legalName,
    },
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK, lineHeight: 1.15 },
    styles: {
      company: { fontSize: 10, bold: true },
      title: { fontSize: 17, bold: true, margin: [0, 14, 0, 0] },
      subtitle: { fontSize: 11, color: MUTED, margin: [0, 2, 0, 8] },
      h2: { fontSize: 11, bold: true, margin: [0, 0, 0, 4] },
      th: { bold: true, color: MUTED, fontSize: 8 },
      muted: { fontSize: 8, color: MUTED },
    },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `Генерирана на ${plain(formatSofiaDateTime(generatedAt))}`, style: "muted" },
        { text: `стр. ${page} от ${pages}`, style: "muted", alignment: "right" },
      ],
      margin: [36, 12, 36, 0],
    }),
  };

  return pdfmake.createPdf(doc).getBuffer();
}
