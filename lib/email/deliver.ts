import { render } from "@react-email/render";
import type { ReactElement } from "react";
import nodemailer from "nodemailer";
import { getResend } from "@/lib/email/resend";
import { currentMailTransport } from "@/lib/email/settings";
import { decryptSecret } from "@/lib/crypto/secretBox";
import type { MailTransport } from "@/lib/email/transport";

export type DeliverInput = {
  /** One address, or several for the staff notifications. */
  to: string | string[];
  subject: string;
  /** A React email template — rendered once, for whichever path is used. */
  react?: ReactElement;
  /** Or ready-made HTML, for the short staff notifications. */
  html?: string;
  /** Log prefix of the caller, e.g. "reminders". */
  tag: string;
  /**
   * Set false for „Изпрати тестов имейл": a test that silently succeeds
   * through Resend would report the SMTP as working when it is not.
   */
  allowFallback?: boolean;
};

export type DeliverResult = {
  ok: boolean;
  /** Which way it actually went — useful in the logs when a fallback fired. */
  via?: "smtp" | "resend";
  error?: string;
};

/**
 * Send one of the studio's own emails.
 *
 * The route is decided by `resolveMailTransport` (SMTP from Админ → Настройки,
 * otherwise Resend). If the SMTP server refuses the handover, the email is
 * retried through Resend when a key is configured — a client should not lose a
 * booking confirmation because a mail host was down. The SMTP failure is
 * always logged, so „works, but not the way you think" is visible.
 *
 * Login codes never come through here: Supabase Auth sends those.
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

  if (transport.kind === "smtp") {
    const smtp = await sendViaSmtp(transport, input);
    if (smtp.ok) return smtp;

    if (
      input.allowFallback === false ||
      !transport.fallback ||
      transport.fallback.kind !== "resend"
    ) {
      return smtp;
    }
    console.warn(`[${input.tag}] SMTP failed; falling back to Resend`, {
      to: input.to,
      error: smtp.error,
    });
    return sendViaResend(transport.fallback.from, input);
  }

  return sendViaResend(transport.from, input);
}

async function sendViaSmtp(
  transport: Extract<MailTransport, { kind: "smtp" }>,
  input: DeliverInput,
): Promise<DeliverResult> {
  try {
    const password = decryptSecret(transport.passwordCipher);
    const html = input.react ? await render(input.react) : input.html!;
    const text = input.react
      ? await render(input.react, { plainText: true })
      : undefined;

    const mailer = nodemailer.createTransport({
      host: transport.host,
      port: transport.port,
      secure: transport.secure,
      auth: { user: transport.user, pass: password },
      // A cron slot is not the place to hang on a dead mail host.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    const info = await mailer.sendMail({
      from: transport.from,
      to: input.to,
      replyTo: transport.replyTo ?? undefined,
      subject: input.subject,
      html,
      text,
    });

    console.log(`[${input.tag}] sent via SMTP`, {
      to: input.to,
      messageId: info.messageId,
    });
    return { ok: true, via: "smtp" };
  } catch (err) {
    return { ok: false, via: "smtp", error: errorText(err) };
  }
}

async function sendViaResend(
  from: string,
  input: DeliverInput,
): Promise<DeliverResult> {
  try {
    // Resend's typing splits react-bodied and html-bodied sends; the payload
    // is otherwise identical, so build it once and pick the body.
    const result = await getResend().emails.send(
      input.react
        ? { from, to: input.to, subject: input.subject, react: input.react }
        : { from, to: input.to, subject: input.subject, html: input.html! },
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
    return { ok: false, via: "resend", error: errorText(err) };
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
