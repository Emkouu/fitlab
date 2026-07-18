import { z } from "zod";

/**
 * Zod schema for loyalty-partner form validation (admin /admin/partners).
 * A partner needs a name; logo, site URL and promo code are each optional,
 * but at least one of siteUrl / promoCode must be present — a card with
 * neither gives the client nothing to act on.
 */
export const partnerFormSchema = z
  .object({
    id: z.string().optional(), // omitted/empty = create, non-empty = edit
    name: z
      .string()
      .min(1, "Името е задължително")
      .max(100, "Името не може да надвишава 100 символа"),
    description: z
      .string()
      .max(200, "Описанието не може да надвишава 200 символа")
      .optional()
      .or(z.literal("")),
    logoUrl: z
      .string()
      .url("Невалиден URL формат")
      .optional()
      .or(z.literal("")),
    siteUrl: z
      .string()
      .url("Невалиден URL формат")
      .optional()
      .or(z.literal("")),
    promoCode: z
      .string()
      .max(50, "Промо кодът не може да надвишава 50 символа")
      .optional()
      .or(z.literal("")),
    active: z.boolean(),
  })
  .refine((d) => (d.siteUrl && d.siteUrl !== "") || (d.promoCode && d.promoCode !== ""), {
    message: "Добави поне линк към сайта или промо код.",
    path: ["promoCode"],
  });

/** Form state / server-action input type. */
export type PartnerFormInput = z.infer<typeof partnerFormSchema>;
