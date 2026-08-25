/**
 * Which way out do our emails go? Pure decision, so the rule is testable and
 * lives in one place — the sending machinery in `deliver.ts` only executes it.
 *
 * „Our emails" means the ones this app composes: booking confirmations, class
 * reminders, the unfinished-deposit nudge, „освободи се място". Login codes are
 * sent by Supabase Auth and never pass through here.
 */

export type SmtpSettingsRow = {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  /** Ciphertext, as stored. Decrypted only at send time. */
  smtpPassword: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
};

export type MailEnv = {
  resendApiKey?: string;
  resendFrom?: string;
};

export type MailTransport =
  | {
      kind: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      passwordCipher: string;
      from: string;
      replyTo: string | null;
      /** Where to go if the SMTP server refuses. */
      fallback: MailTransport | null;
    }
  | { kind: "resend"; from: string }
  | { kind: "none"; reason: string };

const RESEND_DEFAULT_FROM = "FitLab Varna <onboarding@resend.dev>";

/** `"FitLab Varna <info@fitlabvarna.com>"`, or the bare address without a name. */
export function formatFromAddress(
  name: string | null | undefined,
  email: string,
): string {
  const n = name?.trim();
  return n ? `${n} <${email}>` : email;
}

/**
 * What's missing before SMTP can be used? Empty array = ready. Surfaced in the
 * admin panel so „включено, но не работи" is never a silent state.
 */
export function smtpGaps(row: SmtpSettingsRow | null): string[] {
  if (!row) return ["настройки"];
  const gaps: string[] = [];
  if (!row.smtpHost?.trim()) gaps.push("хост");
  if (!row.smtpPort) gaps.push("порт");
  if (!row.smtpUser?.trim()) gaps.push("потребител");
  if (!row.smtpPassword?.trim()) gaps.push("парола");
  if (!row.fromEmail?.trim()) gaps.push("имейл на изпращача");
  return gaps;
}

export function resolveMailTransport(
  row: SmtpSettingsRow | null,
  env: MailEnv,
): MailTransport {
  const resend: MailTransport | null = env.resendApiKey?.trim()
    ? { kind: "resend", from: env.resendFrom?.trim() || RESEND_DEFAULT_FROM }
    : null;

  if (row?.smtpEnabled && smtpGaps(row).length === 0) {
    return {
      kind: "smtp",
      host: row.smtpHost!.trim(),
      port: row.smtpPort!,
      secure: row.smtpSecure,
      user: row.smtpUser!.trim(),
      passwordCipher: row.smtpPassword!,
      from: formatFromAddress(row.fromName, row.fromEmail!.trim()),
      replyTo: row.replyTo?.trim() || null,
      // Configured by the operator: a refused SMTP handover still gets the
      // client their confirmation, and the failure shows up in the log.
      fallback: resend,
    };
  }

  if (resend) return resend;

  return {
    kind: "none",
    reason:
      row?.smtpEnabled && smtpGaps(row).length > 0
        ? `SMTP е включен, но липсва: ${smtpGaps(row).join(", ")}; RESEND_API_KEY също не е зададен`
        : "нито SMTP, нито RESEND_API_KEY са настроени",
  };
}
