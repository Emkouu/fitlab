import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { STUDIO_SLUG } from "./studio";

/**
 * The studio must never be resolved as „whichever row comes back first".
 *
 * A second Studio row is not hypothetical: the booking-engine tests upsert one
 * into whatever database they run against. While `studioDepositAmountMinor`
 * used a bare `findFirst()`, the desk's „+ Депозит" button recorded that test
 * studio's €20 onto real clients, while every screen that looked the studio up
 * by slug went on saying €10.
 *
 * This is a grep, not a unit test, because the bug lives in the *shape* of the
 * query rather than in any one function's output.
 */
describe("studio resolution", () => {
  it("has a single canonical slug", () => {
    expect(STUDIO_SLUG).toBe("fitlab-varna");
  });

  it("is never resolved with an unfiltered findFirst", () => {
    const hits = execSync(
      "grep -rln 'studio\\.findFirst' app lib --exclude-dir=generated --exclude='*.test.ts' || true",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    expect(hits, `use findUnique({ where: { slug: STUDIO_SLUG } }) instead`).toEqual([]);
  });

  it("keeps the slug out of new code as a bare string", () => {
    // The 12 existing call sites predate lib/studio.ts; this guards the one
    // module that is meant to own the constant from drifting from them.
    const source = readFileSync("lib/payments/depositLedger.ts", "utf8");
    expect(source).toContain("STUDIO_SLUG");
    expect(source).not.toContain("studio.findFirst");
  });
});
