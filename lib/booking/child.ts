import { z } from "zod";

/**
 * Children's classes (Practice.isForChildren) — „Детска йога" and the like.
 *
 * The parent's account holds the booking (deposit, phone, consent, the lot);
 * the child is who comes. So a booking for a children's class carries:
 *   * the child's name,
 *   * who takes the child home — the parent, nobody (the child goes alone), or
 *     a named someone else — so staff know whom to hand the child to.
 *
 * A parent may book several children into the same class: the duplicate guard
 * (`unique_active_booking`) is keyed on `participantKey`, which is "" for the
 * account holder and the normalised child name here. The same child twice is
 * still refused.
 *
 * Shared by the booking modal and `bookClassAction` — the server re-validates.
 */

export const CHILD_PICKUPS = ["parent", "alone", "other"] as const;

export type ChildPickupOption = (typeof CHILD_PICKUPS)[number];

export const CHILD_PICKUP_LABEL: Record<ChildPickupOption, string> = {
  parent: "Аз ще си взема детето",
  alone: "Детето ще се прибере само",
  other: "Друг човек ще го вземе",
};

/** Short form for staff screens and the trainer roster. */
export const CHILD_PICKUP_SHORT_LABEL: Record<ChildPickupOption, string> = {
  parent: "взима го родителят",
  alone: "прибира се само",
  other: "взима го",
};

const personName = (required: string) =>
  z
    .string()
    .trim()
    .min(2, required)
    .max(100, "Името трябва да е до 100 символа");

export const childBookingSchema = z
  .object({
    childName: personName("Въведи името на детето"),
    pickup: z.enum(CHILD_PICKUPS, { message: "Избери кой ще вземе детето" }),
    pickupName: z.string().trim().max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pickup === "other" && (v.pickupName ?? "").length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["pickupName"],
        message: "Въведи името на човека, който ще вземе детето",
      });
    }
  })
  .transform((v) => ({
    childName: collapseSpaces(v.childName),
    pickup: v.pickup,
    // Only `other` names a person; anything typed before switching away from it
    // is dropped rather than stored against the wrong choice.
    pickupName: v.pickup === "other" ? collapseSpaces(v.pickupName ?? "") : null,
  }));

export type ChildBookingInput = z.input<typeof childBookingSchema>;
export type ChildBooking = z.output<typeof childBookingSchema>;

/**
 * Who a spot is for, for the duplicate guard: "" for the account holder, the
 * child's name case- and space-insensitively otherwise — „Мария  Иванова" and
 * „мария иванова" are the same child.
 */
export function participantKeyFor(childName: string | null | undefined): string {
  if (!childName) return "";
  return collapseSpaces(childName).toLocaleLowerCase("bg");
}

/** One line for staff: „прибира се само", „взима го Иван Петров"… */
export function describeChildPickup(
  pickup: ChildPickupOption | null | undefined,
  pickupName: string | null | undefined,
): string | null {
  if (!pickup) return null;
  if (pickup === "other") {
    return pickupName
      ? `${CHILD_PICKUP_SHORT_LABEL.other} ${pickupName}`
      : "взима го друг човек";
  }
  return CHILD_PICKUP_SHORT_LABEL[pickup];
}

function collapseSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}
