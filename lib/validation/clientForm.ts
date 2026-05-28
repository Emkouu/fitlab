import { z } from "zod";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * Admin client-profile edit. Email is intentionally NOT editable — it's
 * the Supabase auth identifier and lives in another system.
 */
export const updateClientSchema = z.object({
  userId: z.string().min(1),
  fullName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  role: z.nativeEnum(Role),
  // Cents. Non-negative. Admin override of User.depositBalance.
  depositBalance: z.number().int().min(0).max(100_000_00),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const adminCancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  overrideRefund: z.boolean().default(false),
});

export type AdminCancelBookingInput = z.infer<typeof adminCancelBookingSchema>;
