import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  hasEncryptionKey,
  readKey,
  MissingEncryptionKeyError,
} from "./secretBox";

const KEY_HEX = "a".repeat(64);
const KEY_B64 = Buffer.alloc(32, 7).toString("base64");

describe("secretBox", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("s3cr3t-парола", KEY_HEX);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("s3cr3t");
    expect(decryptSecret(enc, KEY_HEX)).toBe("s3cr3t-парола");
  });

  it("accepts a base64 key too", () => {
    expect(decryptSecret(encryptSecret("x", KEY_B64), KEY_B64)).toBe("x");
  });

  it("gives a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same", KEY_HEX)).not.toBe(encryptSecret("same", KEY_HEX));
  });

  it("refuses a wrong key", () => {
    const enc = encryptSecret("x", KEY_HEX);
    expect(() => decryptSecret(enc, "b".repeat(64))).toThrow();
  });

  it("refuses tampered ciphertext", () => {
    const enc = encryptSecret("x", KEY_HEX);
    const parts = enc.split(".");
    parts[3] = Buffer.from("yy").toString("base64");
    expect(() => decryptSecret(parts.join("."), KEY_HEX)).toThrow();
  });

  it("refuses an unknown format", () => {
    expect(() => decryptSecret("plaintext", KEY_HEX)).toThrow(/формат/);
  });

  it("reports a missing or malformed key", () => {
    expect(() => readKey("")).toThrow(MissingEncryptionKeyError);
    expect(() => readKey("too-short")).toThrow(/32 байта/);
    expect(hasEncryptionKey(KEY_HEX)).toBe(true);
    expect(hasEncryptionKey("")).toBe(false);
    expect(hasEncryptionKey("nope")).toBe(false);
  });
});
