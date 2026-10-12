import { describe, expect, it } from "vitest";
import {
  childBookingSchema,
  describeChildPickup,
  participantKeyFor,
} from "./child";

describe("childBookingSchema", () => {
  it("accepts a child the parent takes home", () => {
    const r = childBookingSchema.safeParse({
      childName: "  Мария   Иванова ",
      pickup: "parent",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      childName: "Мария Иванова",
      pickup: "parent",
      pickupName: null,
    });
  });

  it("requires the child's name", () => {
    const r = childBookingSchema.safeParse({ childName: " ", pickup: "alone" });
    expect(r.success).toBe(false);
  });

  it("requires a pickup choice", () => {
    const r = childBookingSchema.safeParse({ childName: "Мария" });
    expect(r.success).toBe(false);
  });

  it("requires a name when someone else takes the child", () => {
    const r = childBookingSchema.safeParse({
      childName: "Мария",
      pickup: "other",
      pickupName: "",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["pickupName"]);
  });

  it("keeps the other person's name", () => {
    const r = childBookingSchema.safeParse({
      childName: "Мария",
      pickup: "other",
      pickupName: "Баба  Пена",
    });
    expect(r.data?.pickupName).toBe("Баба Пена");
  });

  it("drops a leftover pickup name when it isn't `other`", () => {
    const r = childBookingSchema.safeParse({
      childName: "Мария",
      pickup: "alone",
      pickupName: "Баба Пена",
    });
    expect(r.data?.pickupName).toBeNull();
  });

  it("rejects an unknown pickup", () => {
    const r = childBookingSchema.safeParse({ childName: "Мария", pickup: "taxi" });
    expect(r.success).toBe(false);
  });
});

describe("participantKeyFor", () => {
  it("is empty for the account holder", () => {
    expect(participantKeyFor(null)).toBe("");
    expect(participantKeyFor(undefined)).toBe("");
    expect(participantKeyFor("")).toBe("");
  });

  it("treats case and spacing as the same child", () => {
    expect(participantKeyFor("  Мария   Иванова")).toBe(
      participantKeyFor("мария иванова"),
    );
  });

  it("tells two children apart", () => {
    expect(participantKeyFor("Мария")).not.toBe(participantKeyFor("Иван"));
  });
});

describe("describeChildPickup", () => {
  it("names the other person", () => {
    expect(describeChildPickup("other", "Баба Пена")).toBe("взима го Баба Пена");
  });
  it("says when the child goes alone", () => {
    expect(describeChildPickup("alone", null)).toBe("прибира се само");
  });
  it("is null for an adult booking", () => {
    expect(describeChildPickup(null, null)).toBeNull();
  });
});
