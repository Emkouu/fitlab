import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM for the few secrets an admin types into the panel (today: the
 * SMTP password). The key lives in env — SETTINGS_ENCRYPTION_KEY, 32 bytes as
 * hex or base64 — so a database dump on its own reveals nothing usable.
 *
 * Format: "v1.<iv-b64>.<tag-b64>.<ciphertext-b64>". Versioned, so the scheme
 * can be replaced later without guessing what an old row holds.
 */

const PREFIX = "v1";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "SETTINGS_ENCRYPTION_KEY не е зададен — паролата не може да бъде запазена.",
    );
    this.name = "MissingEncryptionKeyError";
  }
}

/** 32 raw bytes from the env value, accepting hex or base64. */
export function readKey(raw = process.env.SETTINGS_ENCRYPTION_KEY): Buffer {
  const value = raw?.trim();
  if (!value) throw new MissingEncryptionKeyError();

  const buf = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (buf.length !== 32) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY трябва да е 32 байта (64 hex или 44 base64 знака).",
    );
  }
  return buf;
}

/** True when a key is present and usable — checked before offering the form. */
export function hasEncryptionKey(raw?: string): boolean {
  try {
    readKey(raw);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, keyRaw?: string): string {
  const key = readKey(keyRaw);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    PREFIX,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

/**
 * Reverse of `encryptSecret`. Throws on a tampered or truncated value rather
 * than returning something half-right — a wrong SMTP password would only show
 * up as a mail failure hours later.
 */
export function decryptSecret(stored: string, keyRaw?: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Неразпознат формат на шифрованата стойност.");
  }
  const key = readKey(keyRaw);
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time compare, for anything that guards an action by secret. */
export function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
