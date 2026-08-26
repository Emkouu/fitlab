import { prisma } from "@/lib/db";
import {
  resolveFromAddress,
  resolveMailTransport,
  type MailSenderRow,
  type MailTransport,
} from "@/lib/email/transport";

/** The single row. Fixed id, so there is nothing to pick. */
export const EMAIL_SETTINGS_ID = "default";

/**
 * Load the sender identity, or null when nothing has been saved (or the table
 * is not there yet on an environment whose migration hasn't run). Never throws:
 * an unreadable settings row must not stop a booking confirmation from going
 * out — Resend still has its env-configured sender.
 */
export async function loadEmailSettings(): Promise<MailSenderRow | null> {
  try {
    return await prisma.emailSettings.findUnique({
      where: { id: EMAIL_SETTINGS_ID },
      select: { fromName: true, fromEmail: true, replyTo: true },
    });
  } catch (err) {
    console.error("[email] could not read EmailSettings", err);
    return null;
  }
}

function mailEnv() {
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
  };
}

export async function currentMailTransport(): Promise<MailTransport> {
  return resolveMailTransport(await loadEmailSettings(), mailEnv());
}

/** What the admin panel is allowed to see. */
export type EmailSettingsView = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  updatedAt: Date | null;
  updatedByEmail: string | null;
  /** Which way emails actually go out right now. */
  activeTransport: MailTransport["kind"];
  resendConfigured: boolean;
  /** The From line Resend will actually use, whatever its source. */
  effectiveFrom: string;
};

export async function emailSettingsView(): Promise<EmailSettingsView> {
  const row = await prisma.emailSettings
    .findUnique({ where: { id: EMAIL_SETTINGS_ID } })
    .catch(() => null);

  const asRow: MailSenderRow | null = row
    ? { fromName: row.fromName, fromEmail: row.fromEmail, replyTo: row.replyTo }
    : null;

  const env = mailEnv();

  return {
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    updatedAt: row?.updatedAt ?? null,
    updatedByEmail: row?.updatedByEmail ?? null,
    activeTransport: resolveMailTransport(asRow, env).kind,
    resendConfigured: Boolean(env.resendApiKey?.trim()),
    effectiveFrom: resolveFromAddress(asRow, env),
  };
}
