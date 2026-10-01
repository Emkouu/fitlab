import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth/getAdminUser";
import { buildBurnedReport, isBurnOriginFilter } from "@/lib/stats/burnedReport";
import { renderBurnedReportPdf } from "@/lib/stats/burnedReportPdf";
import type { BurnOriginKey } from "@/lib/stats/burnedDeposits";
import { currentMonthKey, isMonthKey, sofiaMonthRange } from "@/lib/stats/monthRange";
import { STUDIO_SLUG } from "@/lib/studio";

/**
 * GET /admin/stats/burned/pdf?month=YYYY-MM — the month's burned deposits as a
 * PDF for the accountant. Same scope as `/admin/stats/burned?month=…` (by the
 * class's Sofia month). `&origin=card` (paid through the bank) or `&origin=cash`
 * narrows it to one register key. Admin only — this is money.
 */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const originParam = params.get("origin");
  const origin = isBurnOriginFilter(originParam) ? originParam : null;
  const monthKey = isMonthKey(month) ? month : currentMonthKey();
  const { from, to } = sofiaMonthRange(monthKey);

  const studio = await prisma.studio.findUnique({
    where: { slug: STUDIO_SLUG },
    select: { id: true },
  });
  if (!studio) return new Response("Studio not found", { status: 500 });

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { depositBurnedMinor: { not: null } },
        { depositFiscalizedAt: { not: null } },
      ],
      scheduledClass: { studioId: studio.id, startAt: { gte: from, lt: to } },
    },
    select: {
      id: true,
      status: true,
      depositBurnedMinor: true,
      depositBurnedMethod: true,
      depositFiscalizedAt: true,
      depositFiscalizedMinor: true,
      user: { select: { fullName: true } },
      scheduledClass: {
        select: { startAt: true, practice: { select: { name: true } } },
      },
    },
  });

  const report = buildBurnedReport(
    bookings.map((b) => ({
      id: b.id,
      status: b.status,
      depositBurnedMinor: b.depositBurnedMinor,
      depositBurnedMethod: b.depositBurnedMethod as BurnOriginKey | null,
      depositFiscalizedAt: b.depositFiscalizedAt,
      depositFiscalizedMinor: b.depositFiscalizedMinor,
      clientName: b.user.fullName,
      practiceName: b.scheduledClass.practice.name,
      classStartAt: b.scheduledClass.startAt,
    })),
    { origin },
  );

  const pdf = await renderBurnedReportPdf(report, monthKey, { origin });
  const suffix = origin ? `-${origin === "card" ? "karta" : "v-broi"}` : "";

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="usvoeni-depoziti-${monthKey}${suffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
