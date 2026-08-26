import { describe, it, expect } from "vitest";
import {
  resolveMailTransport,
  resolveFromAddress,
  formatFromAddress,
  type MailSenderRow,
} from "./transport";

const saved: MailSenderRow = {
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

describe("resolveFromAddress", () => {
  it("prefers the address saved in the panel", () => {
    expect(resolveFromAddress(saved, { resendFrom: "env@b.bg" })).toBe(
      "FitLab Varna <info@fitlabvarna.com>",
    );
  });

  it("falls back to RESEND_FROM, then to Resend's test sender", () => {
    expect(resolveFromAddress(null, { resendFrom: "FitLab <r@b.bg>" })).toBe(
      "FitLab <r@b.bg>",
    );
    expect(resolveFromAddress({ ...saved, fromEmail: "  " }, {})).toBe(
      "FitLab Varna <onboarding@resend.dev>",
    );
  });
});

describe("resolveMailTransport", () => {
  it("is always Resend when the key is there", () => {
    const t = resolveMailTransport(saved, { resendApiKey: "re_1" });
    expect(t).toEqual({
      kind: "resend",
      from: "FitLab Varna <info@fitlabvarna.com>",
      replyTo: null,
    });
  });

  it("carries the saved reply-to", () => {
    const t = resolveMailTransport(
      { ...saved, replyTo: " studio@fitlabvarna.com " },
      { resendApiKey: "re_1" },
    );
    expect(t.kind === "resend" && t.replyTo).toBe("studio@fitlabvarna.com");
  });

  it("works with no saved settings at all", () => {
    const t = resolveMailTransport(null, {
      resendApiKey: "re_1",
      resendFrom: "FitLab <r@b.bg>",
    });
    expect(t).toEqual({ kind: "resend", from: "FitLab <r@b.bg>", replyTo: null });
  });

  it("reports „none\" with a reason when the key is missing", () => {
    const t = resolveMailTransport(saved, { resendApiKey: "  " });
    expect(t.kind).toBe("none");
    if (t.kind !== "none") return;
    expect(t.reason).toMatch(/RESEND_API_KEY/);
  });
});
