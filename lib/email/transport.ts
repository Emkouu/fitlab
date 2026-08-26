/**
 * Which way out do our emails go? One answer: **Resend**.
 *
 * „Our emails" means everything this app composes — booking confirmations,
 * class reminders (clients and trainers), the unfinished-deposit nudge,
 * „освободи се място", the studio notifications to admins. Login codes are sent
 * by Supabase Auth (whose own SMTP is Resend) and never pass through here.
 *
 * The decision is pure so it stays testable and lives in one place; the sending
 * machinery in `deliver.ts` only executes it. The studio's own SMTP option was
 * removed deliberately: one provider means an email can never quietly leave the
 * building by a route nobody is watching.
 */

export type MailSenderRow = {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
};

export type MailEnv = {
  resendApiKey?: string;
  resendFrom?: string;
};

export type MailTransport =
  | { kind: "resend"; from: string; replyTo: string | null }
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
 * The sender Resend is asked to use: the address saved in Админ → Настройки
 * when there is one, otherwise `RESEND_FROM`, otherwise Resend's own test
 * sender — so an email always has a From line.
 *
 * Whichever address is used must belong to a domain verified in Resend; that is
 * why the panel's help text says so next to the field.
 */
export function resolveFromAddress(
  row: MailSenderRow | null,
  env: MailEnv,
): string {
  const email = row?.fromEmail?.trim();
  if (email) return formatFromAddress(row?.fromName, email);
  return env.resendFrom?.trim() || RESEND_DEFAULT_FROM;
}

export function resolveMailTransport(
  row: MailSenderRow | null,
  env: MailEnv,
): MailTransport {
  if (!env.resendApiKey?.trim()) {
    return {
      kind: "none",
      reason: "RESEND_API_KEY не е зададен на сървъра — имейлите не се изпращат",
    };
  }

  return {
    kind: "resend",
    from: resolveFromAddress(row, env),
    replyTo: row?.replyTo?.trim() || null,
  };
}
