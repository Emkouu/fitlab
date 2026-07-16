import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .url("Невалиден URL адрес")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const studioSettingsSchema = z.object({
  name: z.string().trim().min(2, "Името трябва да е поне 2 символа").max(100),
  address: optionalText,
  phone: optionalText,
  facebookUrl: optionalUrl,
  instagramUrl: optionalUrl,
  cancelWindowHours: z
    .number({ error: "Въведи число" })
    .int("Цяло число")
    .min(1, "Поне 1 час")
    .max(48, "Максимум 48 часа"),
  defaultDepositEur: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Депозитът трябва да е валидна EUR сума (напр. 20 или 20.00)",
    ),
  cardPaymentsEnabled: z.boolean(),
});

export type StudioSettingsInput = z.infer<typeof studioSettingsSchema>;
