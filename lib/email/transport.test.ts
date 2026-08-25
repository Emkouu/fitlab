import { describe, it, expect } from "vitest";
import {
  resolveMailTransport,
  smtpGaps,
  formatFromAddress,
  type SmtpSettingsRow,
} from "./transport";

const full: SmtpSettingsRow = {
  smtpEnabled: true,
  smtpHost: "smtp.fitlabvarna.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "info@fitlabvarna.com",
  smtpPassword: "v1.iv.tag.data",
  fromName: "FitLab Varna",
  fromEmail: "info@fitlabvarna.com",
  replyTo: null,
};

describe("formatFromAddress", () => {
  it("adds the display name when there is one", () => {
    expect(formatFromAddress("FitLab Varna", "a@b.bg")).toBe(
      "FitLab Varna <a@b.bg>",
    );
    expect(formatFromAddress(null, "a@b.bg")).toBe("a@b.bg");
    expect(formatFromAddress("   ", "a@b.bg")).toBe("a@b.bg");
  });
});

describe("smtpGaps", () => {
  it("is empty for a complete row", () => {
    expect(smtpGaps(full)).toEqual([]);
  });

  it("names every missing piece", () => {
    expect(
      smtpGaps({ ...full, smtpHost: "", smtpPort: null, smtpPassword: null }),
    ).toEqual(["хост", "порт", "парола"]);
  });
});

describe("resolveMailTransport", () => {
  it("uses SMTP when it is on and complete", () => {
    const t = resolveMailTransport(full, { resendApiKey: "re_1" });
    expect(t.kind).toBe("smtp");
    if (t.kind !== "smtp") return;
    expect(t.host).toBe("smtp.fitlabvarna.com");
    expect(t.from).toBe("FitLab Varna <info@fitlabvarna.com>");
    expect(t.fallback).toEqual({ kind: "resend", from: "FitLab Varna <onboarding@resend.dev>" });
  });

  it("has no fallback when Resend is not configured", () => {
    const t = resolveMailTransport(full, {});
    expect(t.kind === "smtp" && t.fallback).toBe(null);
  });

  it("falls back to Resend when SMTP is switched off", () => {
    const t = resolveMailTransport(
      { ...full, smtpEnabled: false },
      { resendApiKey: "re_1", resendFrom: "FitLab <r@fitlabvarna.com>" },
    );
    expect(t).toEqual({ kind: "resend", from: "FitLab <r@fitlabvarna.com>" });
  });

  it("falls back to Resend when SMTP is on but incomplete", () => {
    const t = resolveMailTransport({ ...full, smtpPassword: null }, { resendApiKey: "re_1" });
    expect(t.kind).toBe("resend");
  });

  it("uses Resend when there are no settings at all", () => {
    expect(resolveMailTransport(null, { resendApiKey: "re_1" }).kind).toBe("resend");
  });

  it("reports „none\" with a reason when nothing is configured", () => {
    const t = resolveMailTransport(null, {});
    expect(t.kind).toBe("none");
    if (t.kind !== "none") return;
    expect(t.reason).toMatch(/нито SMTP/);
  });

  it("says what is missing when SMTP is on, incomplete and Resend is absent", () => {
    const t = resolveMailTransport({ ...full, smtpHost: null }, {});
    expect(t.kind).toBe("none");
    if (t.kind !== "none") return;
    expect(t.reason).toMatch(/хост/);
  });
});
