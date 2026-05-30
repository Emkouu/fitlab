import { z } from "zod";

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
