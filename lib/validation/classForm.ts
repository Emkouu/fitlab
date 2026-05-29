import { z } from "zod";
import { sofiaToUtc } from "../format/sofiaTime";

/**
 * Minimum lead time (ms) between "now" and the class start. Gives the admin
 * a few minutes to save without racing the validator, and avoids accidentally
 * scheduling classes that have already begun.
 */
const MIN_LEAD_MS = 30 * 60 * 1000;

/**
 * Zod schema for class form validation.
 * Validates all required fields for creating or editing a scheduled class.
 *
 * The date+time combination is checked against Europe/Sofia local time: the
 * class start (date at the chosen time, interpreted as Sofia local) must be
 * at least 30 minutes in the future. Today is a valid date as long as the
 * resulting moment is far enough ahead.
 */
export const classFormSchema = z
  .object({
    classId: z.string().optional(), // empty string or omitted = create, non-empty = edit
    date: z.date(),
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
  })
  .superRefine((value, ctx) => {
    // Only meaningful if time has the expected shape; the field-level regex
    // will already raise its own error otherwise.
    if (!/^\d{2}:\d{2}$/.test(value.time)) return;

    const startAtUtc = sofiaToUtc(value.date, value.time);
    const earliest = new Date(Date.now() + MIN_LEAD_MS);
    if (startAtUtc < earliest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["time"],
        message: "Часът трябва да е поне 30 минути в бъдещето.",
      });
    }
  });

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for form state and server action arguments.
 */
export type ClassFormInput = z.infer<typeof classFormSchema>;
