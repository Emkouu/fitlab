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
});

export type PracticeFormInput = z.infer<typeof practiceFormSchema>;
