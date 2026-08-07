import { z } from "zod";

export const practiceFormSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(2, "Името трябва да е поне 2 символа")
    .max(100, "Името трябва да е до 100 символа"),
  slug: z
    .string()
    .min(1, "Slug е задължителен")
    .max(100, "Slug трябва да е до 100 символа")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug може да съдържа само малки латински букви, цифри и тирета"),
  description: z
    .string()
    .max(1000, "Описанието трябва да е до 1000 символа")
    .optional()
    .nullable(),
  /// Optional per-practice price override in EUR ("" → use the studio default).
  priceEur: z
    .string()
    .trim()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Цената трябва да е валидна EUR сума (напр. 10 или 10.00)",
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PracticeFormInput = z.infer<typeof practiceFormSchema>;
