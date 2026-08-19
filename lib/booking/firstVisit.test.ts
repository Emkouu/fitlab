import { describe, expect, it } from "vitest";
import { isFirstVisitEligible } from "./firstVisit";

describe("isFirstVisitEligible", () => {
  it("lets a client who has never booked reserve without a deposit", () => {
    expect(isFirstVisitEligible(0)).toBe(true);
  });

  it("shuts the door once the free booking exists", () => {
    // The free reservation itself is booking number one.
    expect(isFirstVisitEligible(1)).toBe(false);
  });

  it("counts a cancelled booking too, so cancel-and-retry earns nothing", () => {
    // The caller counts every status; this is the rule that makes that matter.
    expect(isFirstVisitEligible(3)).toBe(false);
  });
});
