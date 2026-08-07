import { describe, expect, it } from "vitest";
import {
  describeResultCode,
  formatResultCode,
  isApprovalCode,
} from "./responseCodes";

describe("describeResultCode", () => {
  it("resolves the codes staff actually see", () => {
    expect(describeResultCode("000")).toBe("Approved");
    expect(describeResultCode("116")).toBe("Decline, not sufficient funds");
    expect(describeResultCode("101")).toBe("Decline, expired card");
    expect(describeResultCode("160")).toBe(
      "Decline, require Strong Customer Authentication",
    );
    expect(describeResultCode("400")).toBe("Accepted (for reversal)");
  });

  it("tolerates surrounding whitespace from the wire", () => {
    expect(describeResultCode(" 116 ")).toBe("Decline, not sufficient funds");
  });

  it("returns null rather than throwing on codes the bank hasn't documented", () => {
    expect(describeResultCode("999")).toBeNull();
    expect(describeResultCode("")).toBeNull();
    expect(describeResultCode(null)).toBeNull();
    expect(describeResultCode(undefined)).toBeNull();
  });
});

describe("formatResultCode", () => {
  it("pairs the code with its reason", () => {
    expect(formatResultCode("116")).toBe("116 — Decline, not sufficient funds");
  });

  it("falls back to the bare code when unknown", () => {
    expect(formatResultCode("999")).toBe("999");
  });

  it("passes through absence", () => {
    expect(formatResultCode(null)).toBeNull();
  });
});

describe("isApprovalCode", () => {
  it("recognises the 0xx family", () => {
    expect(isApprovalCode("000")).toBe(true);
    expect(isApprovalCode("007")).toBe(true);
  });

  it("rejects declines and non-codes", () => {
    expect(isApprovalCode("100")).toBe(false);
    expect(isApprovalCode("400")).toBe(false);
    expect(isApprovalCode("XXX")).toBe(false);
    expect(isApprovalCode(null)).toBe(false);
  });
});
