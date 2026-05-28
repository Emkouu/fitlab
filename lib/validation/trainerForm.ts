import { z } from "zod";

/**
 * Zod schema for trainer form validation.
 * Validates all required fields for creating or editing a trainer.
 */
export const trainerFormSchema = z.object({
  trainerId: z.string().optional(), // empty string or omitted = create, non-empty = edit
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  photoUrl: z.string().url("Invalid URL format").optional().or(z.literal("")),
  bio: z.string().optional(),
  specialtyIds: z
    .array(z.string())
    .min(1, "At least one specialty is required")
    .max(10, "Maximum 10 specialties allowed"),
  linkedUserId: z.string().nullable().optional(),
});

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for form state and server action arguments.
 */
export type TrainerFormInput = z.infer<typeof trainerFormSchema>;
