import { z } from "zod";
import { tomorrowSofiaDate } from "../format/sofiaTime";

/**
 * Zod schema for class form validation.
 * Validates all required fields for creating or editing a scheduled class.
 */
export const classFormSchema = z.object({
  classId: z.string().optional(), // empty string or omitted = create, non-empty = edit
  date: z
    .date()
    .refine(
      (d) => d >= tomorrowSofiaDate(),
      "Date must be in the future (tomorrow or later in Sofia timezone)",
    ),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format (00:00–23:59)"),
  duration: z.enum(["45", "55", "60", "70", "80", "90", "100", "120"]),
  practiceId: z.string().nonempty("Practice is required"),
  trainerIds: z
    .array(z.string())
    .min(1, "At least one trainer is required")
    .max(2, "Maximum two trainers allowed"),
  capacity: z
    .number()
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1")
    .max(30, "Capacity cannot exceed 30"),
  depositEur: z
    .string()
    .regex(
      /^\d+(\.\d{2})?$/,
      'Deposit must be a valid EUR amount (e.g., "20", "20.00", "0.50")',
    ),
  isSpecialEvent: z.boolean().default(false),
  eventNotes: z.string().optional(),
});

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for form state and server action arguments.
 */
export type ClassFormInput = z.infer<typeof classFormSchema>;
