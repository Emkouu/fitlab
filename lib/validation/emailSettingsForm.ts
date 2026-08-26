import { z } from "zod";

/**
 * Админ → Настройки → Системни настройки → „Изпращане на имейли".
 *
 * Shared client/API shape, like every other form (CLAUDE.md §3). All of the
 * studio's own emails go out through Resend; the only thing configurable
 * without a deploy is who they appear to come from.
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

export const emailSettingsSchema = z.object({
  fromName: optionalText,
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
});

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;

export const testEmailSchema = z.object({
  to: z.string().trim().email("Невалиден имейл адрес"),
});

export type TestEmailInput = z.infer<typeof testEmailSchema>;
