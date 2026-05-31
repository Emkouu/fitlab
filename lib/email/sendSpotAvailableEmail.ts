import { getResend } from "@/lib/email/resend";
import { SpotAvailable } from "@/emails/SpotAvailable";

const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "FitLab Varna <onboarding@resend.dev>";

const LOGO_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/logo.png`
  : "https://fitlabvarna.com/logo.png";

export type SpotAvailableInput = {
  to: string;
  greetingName: string | null;
  practiceName: string;
  dateText: string;
  timeText: string;
  durationMinutes: number;
  trainersText: string;
  studioName: string;
  studioAddress: string;
};

export async function sendSpotAvailableEmail(
  input: SpotAvailableInput,
): Promise<{ ok: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[notifications] RESEND_API_KEY not set; skipping email", {
      to: input.to,
    });
    return { ok: false };
  }

  const scheduleUrl =
    (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "http://localhost:3000") + "/schedule";

  const reactNode = SpotAvailable({
    greetingName: input.greetingName,
    practiceName: input.practiceName,
    dateText: input.dateText,
    timeText: input.timeText,
    durationMinutes: input.durationMinutes,
    trainersText: input.trainersText,
    studioName: input.studioName,
    studioAddress: input.studioAddress,
    scheduleUrl,
    logoUrl: LOGO_URL,
    footerSite: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: `Освободи се място — ${input.practiceName} на ${input.dateText} в ${input.timeText}`,
      react: reactNode,
    });
    if (result.error) {
      console.error("[notifications] resend error", {
        to: input.to,
        error: result.error,
      });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notifications] send threw", { to: input.to, err });
    return { ok: false };
  }
}
