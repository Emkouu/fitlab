import { deliverEmail } from "@/lib/email/deliver";
import { SpotAvailable } from "@/emails/SpotAvailable";

const STUDIO_PHONE = "088 241 4863";

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
    studioPhone: STUDIO_PHONE,
    scheduleUrl,
    logoUrl: LOGO_URL,
    footerSite: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  const sent = await deliverEmail({
    to: input.to,
    subject: `Освободи се място — ${input.practiceName} на ${input.dateText} в ${input.timeText}`,
    react: reactNode,
    tag: "notifications",
  });
  return { ok: sent.ok };
}
