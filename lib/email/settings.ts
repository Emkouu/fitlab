import { prisma } from "@/lib/db";
import { hasEncryptionKey } from "@/lib/crypto/secretBox";
import {
  resolveMailTransport,
  smtpGaps,
  type MailTransport,
  type SmtpSettingsRow,
} from "@/lib/email/transport";

/** The single row. Fixed id, so there is nothing to pick. */
export const EMAIL_SETTINGS_ID = "default";

/**
 * Load the mail settings, or null when nothing has been saved (or the table is
 * not there yet on an environment whose migration hasn't run). Never throws:
 * an unreadable settings row must not stop a booking confirmation from going
 * out through Resend.
 */
export async function loadEmailSettings(): Promise<SmtpSettingsRow | null> {
  try {
    return await prisma.emailSettings.findUnique({
      where: { id: EMAIL_SETTINGS_ID },
      select: {
        smtpEnabled: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        fromName: true,
        fromEmail: true,
        replyTo: true,
      },
    });
  } catch (err) {
    console.error("[email] could not read EmailSettings", err);
    return null;
  }
}

export async function currentMailTransport(): Promise<MailTransport> {
  return resolveMailTransport(await loadEmailSettings(), {
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
  });
}

/** What the admin panel is allowed to see — everything except the password. */
export type EmailSettingsView = {
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string;
  /** Whether a password is stored. The value itself never leaves the server. */
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  updatedAt: Date | null;
  updatedByEmail: string | null;
  /** What is still missing before SMTP can be used. */
  gaps: string[];
  /** Which way emails actually go out right now. */
  activeTransport: MailTransport["kind"];
  /** Whether SETTINGS_ENCRYPTION_KEY is present — without it no password can be saved. */
  encryptionKeyPresent: boolean;
  resendConfigured: boolean;
};

export async function emailSettingsView(): Promise<EmailSettingsView> {
  const row = await prisma.emailSettings
    .findUnique({ where: { id: EMAIL_SETTINGS_ID } })
    .catch(() => null);

  const asRow: SmtpSettingsRow | null = row
    ? {
        smtpEnabled: row.smtpEnabled,
        smtpHost: row.smtpHost,
        smtpPort: row.smtpPort,
        smtpSecure: row.smtpSecure,
        smtpUser: row.smtpUser,
        smtpPassword: row.smtpPassword,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        replyTo: row.replyTo,
      }
    : null;

  const transport = resolveMailTransport(asRow, {
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
  });

  return {
    smtpEnabled: row?.smtpEnabled ?? false,
    smtpHost: row?.smtpHost ?? "",
    smtpPort: row?.smtpPort ?? null,
    smtpSecure: row?.smtpSecure ?? true,
    smtpUser: row?.smtpUser ?? "",
    hasPassword: Boolean(row?.smtpPassword),
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    updatedAt: row?.updatedAt ?? null,
    updatedByEmail: row?.updatedByEmail ?? null,
    gaps: asRow ? smtpGaps(asRow) : [],
    activeTransport: transport.kind,
    encryptionKeyPresent: hasEncryptionKey(),
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  };
}
