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

/**
 * Staff add-client form (admins + coaches). Creates a bare member User row;
 * the person claims it on first sign-in — `syncUserFromSupabase` matches by
 * phone/email and links the Supabase account to the existing row.
 * At least one contact (phone or email) is required for that match to work.
 */
export const addClientSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Името е задължително")
      .max(120, "Името не може да надвишава 120 символа"),
    phone: z
      .string()
      .trim()
      .max(32, "Телефонът не може да надвишава 32 символа")
      .optional()
      .or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("Невалиден имейл")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => (d.phone && d.phone !== "") || (d.email && d.email !== ""), {
    message: "Добави телефон или имейл — иначе клиентът не може да влезе.",
    path: ["phone"],
  });

export type AddClientInput = z.infer<typeof addClientSchema>;

/**
 * Refund a client's unused deposit — the case the acquirer asked us to spell
 * out: the client no longer wants the deposit sitting on their profile and asks
 * for the money back.
 *
 * `method` records how the money physically leaves:
 *   `card` — a card operation back to the same card (the only permitted route
 *            for money that arrived by card, Fibank instruction §I.16).
 *   `cash` — deposits left at the desk in cash are returned in cash there;
 *            nothing to send to the bank, we only clear the balance.
 */
export const refundDepositSchema = z.object({
  userId: z.string().min(1),
  method: z.enum(["card", "cash"]),
  /** Required for `card`: which paid card transaction to reverse. */
  paymentId: z.string().min(1).optional(),
});

export type RefundDepositInput = z.infer<typeof refundDepositSchema>;
