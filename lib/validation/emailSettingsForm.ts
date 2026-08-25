import { z } from "zod";

/**
 * Админ → Настройки → Системни настройки → „Изпращане на имейли (SMTP)".
 *
 * Shared client/API shape, like every other form (CLAUDE.md §3). The password
 * is optional on purpose: an empty field means „keep what is stored", so
 * editing the port doesn't require retyping the password — and the stored
 * value is never sent to the browser to be echoed back.
 */

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .email("Невалиден имейл адрес")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const emailSettingsSchema = z
  .object({
    smtpEnabled: z.boolean(),
    smtpHost: optionalText,
    smtpPort: z
      .number({ error: "Въведи число" })
      .int("Цяло число")
      .min(1, "Невалиден порт")
      .max(65535, "Невалиден порт")
      .optional()
      .nullable(),
    smtpSecure: z.boolean(),
    smtpUser: optionalText,
    /** Empty = keep the stored password. */
    smtpPassword: z.string().max(400).optional(),
    fromName: optionalText,
    fromEmail: optionalEmail,
    replyTo: optionalEmail,
  })
  // Switching SMTP on with half the fields filled would silently keep sending
  // through Resend, so the form refuses it instead of pretending it worked.
  .refine(
    (v) =>
      !v.smtpEnabled ||
      Boolean(v.smtpHost && v.smtpPort && v.smtpUser && v.fromEmail),
    {
      message:
        "За включен SMTP са нужни хост, порт, потребител и имейл на изпращача.",
      path: ["smtpEnabled"],
    },
  );

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;

export const testEmailSchema = z.object({
  to: z.string().trim().email("Невалиден имейл адрес"),
});

export type TestEmailInput = z.infer<typeof testEmailSchema>;
