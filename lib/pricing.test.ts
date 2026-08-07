import { describe, expect, it } from "vitest";
import { FALLBACK_CLASS_PRICE_MINOR, classPriceMinor } from "./pricing";

describe("classPriceMinor", () => {
  it("prefers the practice override", () => {
    expect(classPriceMinor({ priceMinor: 1800 }, { defaultClassPrice: 1000 })).toBe(1800);
  });

  it("falls back to the studio default when the practice has no override", () => {
    expect(classPriceMinor({ priceMinor: null }, { defaultClassPrice: 1200 })).toBe(1200);
  });

  it("treats a free class as a real price, not as 'unset'", () => {
    expect(classPriceMinor({ priceMinor: 0 }, { defaultClassPrice: 1000 })).toBe(0);
    expect(classPriceMinor({ priceMinor: null }, { defaultClassPrice: 0 })).toBe(0);
  });

  it("falls back to €10 when neither row carries a price", () => {
    expect(classPriceMinor(null, null)).toBe(FALLBACK_CLASS_PRICE_MINOR);
    expect(classPriceMinor(undefined, { defaultClassPrice: null })).toBe(
      FALLBACK_CLASS_PRICE_MINOR,
    );
  });

  it("ignores negative or non-finite stored values", () => {
    expect(classPriceMinor({ priceMinor: -500 }, { defaultClassPrice: 1000 })).toBe(1000);
    expect(classPriceMinor({ priceMinor: Number.NaN }, { defaultClassPrice: 1000 })).toBe(1000);
    expect(classPriceMinor({ priceMinor: -1 }, { defaultClassPrice: -1 })).toBe(
      FALLBACK_CLASS_PRICE_MINOR,
    );
  });
});
