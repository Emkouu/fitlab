import { describe, it, expect } from "vitest";
import { formatEurMinor, formatEurMinorCompact } from "./format";

// The bg-BG currency format uses a NBSP before the symbol; compare on the
// digits so the tests don't hinge on which space Node's ICU emits.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatEurMinorCompact", () => {
  it("drops the cents on whole amounts", () => {
    expect(norm(formatEurMinorCompact(26000))).toBe("260 €");
    expect(norm(formatEurMinorCompact(1000))).toBe("10 €");
    expect(norm(formatEurMinorCompact(0))).toBe("0 €");
    expect(norm(formatEurMinorCompact(123400))).toBe("1234 €");
  });

  it("keeps the cents when there are any", () => {
    expect(norm(formatEurMinorCompact(1250))).toBe("12,50 €");
    expect(norm(formatEurMinorCompact(26099))).toBe("260,99 €");
    expect(norm(formatEurMinorCompact(1))).toBe("0,01 €");
  });

  it("never rounds — the exact formatter is unchanged", () => {
    expect(norm(formatEurMinor(26000))).toBe("260,00 €");
    expect(norm(formatEurMinor(1250))).toBe("12,50 €");
  });
});
