import { describe, expect, it } from "vitest";
import { isProfileComplete, onboardingPathFor } from "./profileComplete";

describe("isProfileComplete", () => {
  it("accepts a profile with both a name and a phone", () => {
    expect(isProfileComplete({ fullName: "Иван Петров", phone: "+359881234567" })).toBe(true);
  });

  it("refuses a missing phone — the old bug: named client nobody could call", () => {
    expect(isProfileComplete({ fullName: "Иван Петров", phone: null })).toBe(false);
    expect(isProfileComplete({ fullName: "Иван Петров", phone: "" })).toBe(false);
    expect(isProfileComplete({ fullName: "Иван Петров", phone: "   " })).toBe(false);
  });

  it("refuses a missing name", () => {
    expect(isProfileComplete({ fullName: null, phone: "+359881234567" })).toBe(false);
    expect(isProfileComplete({ fullName: "  ", phone: "+359881234567" })).toBe(false);
  });

  it("refuses an absent profile rather than assuming the best", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
  });
});

describe("onboardingPathFor", () => {
  it("carries the destination so the client resumes where they were", () => {
    expect(onboardingPathFor("/schedule?openBooking=abc")).toBe(
      "/onboarding?next=%2Fschedule%3FopenBooking%3Dabc",
    );
  });
});
