import type { ReactElement } from "react";
import { getResend } from "@/lib/email/resend";
import { currentMailTransport } from "@/lib/email/settings";

export type DeliverInput = {
  /** One address, or several for the staff notifications. */
  to: string | string[];
  subject: string;
  /** A React email template. */
  react?: ReactElement;
  /** Or ready-made HTML, for the short staff notifications. */
  html?: string;
  /** Log prefix of the caller, e.g. "reminders". */
  tag: string;
};

export type DeliverResult = {
  ok: boolean;
  /** Which way it actually went — one route today, kept for the logs. */
  via?: "resend";
  error?: string;
};

/**
 * Send one of the studio's own emails — every single one of them, through
 * Resend.
 *
 * Booking confirmations, class reminders to clients and to trainers, the
 * unfinished-deposit nudge, „освободи се място", the new-booking and
 * card-payment notifications to admins: they all come through this one door, so
 * there is exactly one provider to watch and one place where a failure is
 * logged.
 *
 * Login codes never come through here: Supabase Auth sends those (over its own
 * Resend SMTP), which is why nothing on the admin screen can affect a client's
 * ability to sign in.
 */
export async function deliverEmail(input: DeliverInput): Promise<DeliverResult> {
  const transport = await currentMailTransport();

  if (transport.kind === "none") {
    console.error(`[${input.tag}] no mail transport configured; skipping send`, {
      to: input.to,
      reason: transport.reason,
    });
    return { ok: false, error: transport.reason };
  }

  try {
    // Resend's typing splits react-bodied and html-bodied sends; the payload is
    // otherwise identical, so build the common part once and pick the body.
    const common = {
      from: transport.from,
      to: input.to,
      subject: input.subject,
      ...(transport.replyTo ? { replyTo: transport.replyTo } : {}),
    };
    const result = await getResend().emails.send(
      input.react
        ? { ...common, react: input.react }
        : { ...common, html: input.html! },
    );
    if (result.error) {
      console.error(`[${input.tag}] resend error`, {
        to: input.to,
        error: result.error,
      });
      return { ok: false, via: "resend", error: result.error.message };
    }
    console.log(`[${input.tag}] sent via Resend`, {
      to: input.to,
      id: result.data?.id,
    });
    return { ok: true, via: "resend" };
  } catch (err) {
    console.error(`[${input.tag}] resend send threw`, err);
    return {
      ok: false,
      via: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
