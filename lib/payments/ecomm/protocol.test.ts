import { describe, expect, it } from "vitest";
import {
  ECOMM_DESCRIPTION_MAX,
  ECOMM_LANGUAGE,
  asEcommResult,
  formatEcommAmount,
  isFibankTestCertificate,
  normalizeClientIp,
  parseEcommResponse,
  sanitizeEcommDescription,
  transliterateBg,
} from "./protocol";

describe("parseEcommResponse", () => {
  it("parses a registration reply", () => {
    const r = parseEcommResponse("TRANSACTION_ID: bAt6JLX52DUbibbzD9gDFl5Ppr4=");
    expect(r).toEqual({
      ok: true,
      fields: { TRANSACTION_ID: "bAt6JLX52DUbibbzD9gDFl5Ppr4=" },
    });
  });

  it("parses the full result block from the manual", () => {
    const raw = [
      "RESULT: OK",
      "RESULT_CODE: 000",
      "3DSECURE: AUTHENTICATED",
      "RRN: 611111407831",
      "APPROVAL_CODE: B30361",
      "CARD_NUMBER: 4***********6789",
    ].join("\r\n");

    const r = parseEcommResponse(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).toEqual({
      RESULT: "OK",
      RESULT_CODE: "000",
      "3DSECURE": "AUTHENTICATED",
      RRN: "611111407831",
      APPROVAL_CODE: "B30361",
      CARD_NUMBER: "4***********6789",
    });
  });

  it("keeps a base64 value containing a colon-free '=' padding intact", () => {
    const r = parseEcommResponse("REFUND_TRANS_ID: abc/def+gh=");
    expect(r.ok && r.fields.REFUND_TRANS_ID).toBe("abc/def+gh=");
  });

  it("treats an 'error:' body as a failure, not as a field", () => {
    const r = parseEcommResponse("error: unknown merchant");
    expect(r).toEqual({ ok: false, error: "unknown merchant" });
  });

  it("fails on an empty body", () => {
    expect(parseEcommResponse("   ").ok).toBe(false);
  });

  it("fails when nothing looks like a field", () => {
    expect(parseEcommResponse("<html>gateway timeout</html>").ok).toBe(false);
  });

  it("ignores blank and field-less lines", () => {
    const r = parseEcommResponse("RESULT: FAILED\n\nnot-a-field\nRESULT_CODE: 116");
    expect(r.ok && r.fields).toEqual({ RESULT: "FAILED", RESULT_CODE: "116" });
  });
});

describe("ECOMM_LANGUAGE", () => {
  it("is `default`, as the acquirer instructed", () => {
    // Their letter of 08.08.2026: „трябва да подавате default за параметъра
    // language". Sending a locale like "bg" is what we had first and is wrong.
    expect(ECOMM_LANGUAGE).toBe("default");
  });
});

describe("asEcommResult", () => {
  it("narrows known statuses regardless of case", () => {
    expect(asEcommResult("ok")).toBe("OK");
    expect(asEcommResult("AUTOREVERSED")).toBe("AUTOREVERSED");
  });

  it("returns null for anything the manual doesn't list", () => {
    expect(asEcommResult("SOMETHING_NEW")).toBeNull();
    expect(asEcommResult(undefined)).toBeNull();
  });
});

describe("formatEcommAmount", () => {
  it("sends minor units as a plain integer", () => {
    expect(formatEcommAmount(1000)).toBe("1000");
    expect(formatEcommAmount(1)).toBe("1");
  });

  it("rejects zero, negatives and fractions", () => {
    expect(() => formatEcommAmount(0)).toThrow();
    expect(() => formatEcommAmount(-1000)).toThrow();
    expect(() => formatEcommAmount(10.5)).toThrow();
  });

  it("rejects more than 12 digits", () => {
    expect(() => formatEcommAmount(1_000_000_000_000_0)).toThrow();
  });
});

describe("transliterateBg", () => {
  it("romanises Bulgarian practice names", () => {
    expect(transliterateBg("Виняса Флоу")).toBe("Vinyasa Flou");
    expect(transliterateBg("Хатха")).toBe("Hatha");
  });

  it("keeps the case of multi-character mappings", () => {
    expect(transliterateBg("Жар")).toBe("Zhar");
    expect(transliterateBg("Щастие")).toBe("Shtastie");
  });

  it("leaves latin text alone", () => {
    expect(transliterateBg("FitLab Varna")).toBe("FitLab Varna");
  });
});

describe("sanitizeEcommDescription", () => {
  it("produces latin letters, digits and safe separators only", () => {
    expect(sanitizeEcommDescription("Депозит — Виняса Флоу, 07.08.2026 г.")).toBe(
      "Depozit Vinyasa Flou, 07.08.2026 g.",
    );
  });

  it("collapses whitespace introduced by stripped characters", () => {
    expect(sanitizeEcommDescription("A  —  B")).toBe("A B");
  });

  it("truncates to the bank's 125-character limit", () => {
    const out = sanitizeEcommDescription("Депозит ".repeat(40));
    expect(out.length).toBeLessThanOrEqual(ECOMM_DESCRIPTION_MAX);
  });

  it("never leaves a trailing space after truncation", () => {
    const out = sanitizeEcommDescription("ab ".repeat(80));
    expect(out).toBe(out.trim());
  });
});

describe("isFibankTestCertificate", () => {
  // The SAN string the test gateway actually presented on 08.08.2026.
  const REAL = "DNS:eur-3ds-ecomm-test.int.fibank.bg, DNS:eur-3ds-ecomm-test, IP Address:10.10.34.211, DNS:localhost, IP Address:127.0.0.1";

  it("recognises the bank's test certificate", () => {
    expect(isFibankTestCertificate(REAL)).toBe(true);
  });

  it("matches whole names, not substrings", () => {
    // A lookalike host must not inherit the exemption.
    expect(
      isFibankTestCertificate("DNS:evil-eur-3ds-ecomm-test.attacker.example"),
    ).toBe(false);
    expect(
      isFibankTestCertificate("DNS:eur-3ds-ecomm-test.int.fibank.bg.attacker.example"),
    ).toBe(false);
  });

  it("ignores IP entries — only DNS names grant the exemption", () => {
    expect(isFibankTestCertificate("IP Address:10.10.34.211")).toBe(false);
  });

  it("is case-insensitive about the name, as DNS is", () => {
    expect(isFibankTestCertificate("DNS:EUR-3DS-ECOMM-TEST")).toBe(true);
  });

  it("refuses an unrelated or absent SAN", () => {
    expect(isFibankTestCertificate("DNS:example.com")).toBe(false);
    expect(isFibankTestCertificate("")).toBe(false);
    expect(isFibankTestCertificate(undefined)).toBe(false);
  });
});

describe("normalizeClientIp", () => {
  it("takes the first IPv4 from an x-forwarded-for list", () => {
    expect(normalizeClientIp("78.90.1.2, 10.0.0.1")).toBe("78.90.1.2");
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(normalizeClientIp("::ffff:78.90.1.2")).toBe("78.90.1.2");
  });

  it("strips a port suffix", () => {
    expect(normalizeClientIp("78.90.1.2:51234")).toBe("78.90.1.2");
  });

  it("skips a real IPv6 address and uses the next IPv4", () => {
    expect(normalizeClientIp("2001:db8::1, 78.90.1.2")).toBe("78.90.1.2");
  });

  it("falls back to 0.0.0.0 rather than aborting a payment", () => {
    expect(normalizeClientIp(null)).toBe("0.0.0.0");
    expect(normalizeClientIp("")).toBe("0.0.0.0");
    expect(normalizeClientIp("2001:db8::1")).toBe("0.0.0.0");
    expect(normalizeClientIp("999.1.1.1")).toBe("0.0.0.0");
  });

  it("never exceeds the documented 15 characters", () => {
    expect(normalizeClientIp("255.255.255.255").length).toBeLessThanOrEqual(15);
  });
});
