/**
 * Fibank ECOMM wire protocol — the pure, transport-free half.
 *
 * ECOMM speaks `application/x-www-form-urlencoded` in and a plain-text block of
 * `KEY: value` lines out (integration manual §4). Errors are not signalled by an
 * HTTP status but by a body that starts with `error:`, so parsing is where most
 * of the correctness lives — hence it sits here, separately tested, away from
 * the mTLS socket code in `client.ts`.
 *
 * Nothing in this file does I/O.
 */

/** ISO 4217 numeric code for the euro. FitLab is EUR everywhere. */
export const ECOMM_CURRENCY_EUR = "978";

/**
 * `language` — the cardinfo template identifier sent with `command=v`.
 *
 * The manual calls this an "ISO language name / default value is 'Default'",
 * which reads like a locale, but the acquirer instructed us explicitly
 * (08.08.2026): „При заявката за генериране на транзакция, трябва да подавате
 * default за параметъра language." The Bulgarian wording of the page comes from
 * the template we submitted, not from this parameter, so `default` is both what
 * they asked for and what selects our template.
 */
export const ECOMM_LANGUAGE = "default";

/** `description` is capped at 125 characters by the bank. */
export const ECOMM_DESCRIPTION_MAX = 125;

/** RESULT values the bank can return (manual §4.2). */
export const ECOMM_RESULTS = [
  "OK",
  "FAILED",
  "CREATED",
  "PENDING",
  "DECLINED",
  "REVERSED",
  "AUTOREVERSED",
  "TIMEOUT",
] as const;

export type EcommResult = (typeof ECOMM_RESULTS)[number];

/** Parsed ECOMM reply: either the field block, or the bank's own error text. */
export type EcommResponse =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; error: string };

/**
 * Turn a raw ECOMM reply body into fields.
 *
 * The bank sends one `KEY: value` per line. A body beginning with `error:` is a
 * protocol-level failure and never carries fields. Unknown keys are kept — the
 * manual requires the merchant to preserve every response parameter (§4.2), so
 * throwing away what we don't recognise would be wrong.
 */
export function parseEcommResponse(raw: string): EcommResponse {
  const body = raw.trim();
  if (body === "") return { ok: false, error: "empty response from ECOMM" };

  // `error:` may be the whole body or its first line.
  const firstLine = body.split(/\r?\n/, 1)[0].trim();
  if (/^error\s*:/i.test(firstLine)) {
    return { ok: false, error: firstLine.replace(/^error\s*:\s*/i, "").trim() || "unknown error" };
  }

  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue; // not a field line — ignore rather than guess
    const key = trimmed.slice(0, idx).trim().toUpperCase();
    if (key === "") continue;
    fields[key] = trimmed.slice(idx + 1).trim();
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, error: `unparseable ECOMM response: ${body.slice(0, 200)}` };
  }
  return { ok: true, fields };
}

/** Narrow a raw RESULT string to a known status, or null if the bank sent something new. */
export function asEcommResult(value: string | undefined): EcommResult | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return (ECOMM_RESULTS as readonly string[]).includes(upper)
    ? (upper as EcommResult)
    : null;
}

/**
 * Amount as ECOMM wants it: "transaction amount in fractional units", i.e. the
 * integer number of cents, no separator, no sign, up to 12 digits.
 */
export function formatEcommAmount(minor: number): string {
  if (!Number.isInteger(minor) || minor <= 0) {
    throw new Error(`ECOMM amount must be a positive integer of minor units, got ${minor}`);
  }
  const s = String(minor);
  if (s.length > 12) {
    throw new Error(`ECOMM amount exceeds 12 digits: ${s}`);
  }
  return s;
}

/* ─── description ──────────────────────────────────────────────────────────── */

// Bulgarian → Latin, per the official transliteration rules (Закон за
// транслитерацията). The bank accepts only latin letters and digits in
// `description`, so a Cyrillic practice name has to be romanised rather than
// dropped — "Vinyasa Flow 07.08" is readable on a card statement, "?????" is not.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/** Romanise a Bulgarian string; characters with no mapping are dropped. */
export function transliterateBg(input: string): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    // Preserve the case of the source letter for multi-char mappings ("Zh").
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

/**
 * A `description` the bank will accept: transliterated, reduced to latin
 * letters, digits and a few safe separators, collapsed and truncated to 125.
 */
export function sanitizeEcommDescription(input: string): string {
  const latin = transliterateBg(input)
    // Strip diacritics that survived from any non-Bulgarian input.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const cleaned = latin
    .replace(/[^A-Za-z0-9 .,\-/:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, ECOMM_DESCRIPTION_MAX).trim();
}

/* ─── TLS identity of the bank's test gateway ──────────────────────────────── */

/**
 * Host names the Fibank **test** gateway actually presents.
 *
 * `mdpay-test.fibank.bg` serves a certificate issued for the bank's internal
 * names — `eur-3ds-ecomm-test.int.fibank.bg`, plus `localhost` and RFC1918
 * addresses — so Node's hostname check fails with „Hostname/IP does not match
 * certificate's altnames" even though the certificate chain itself verifies.
 *
 * Production (`mdpay.fibank.bg`) is expected to present a matching certificate
 * and is never given this exemption — see `client.ts`.
 */
export const FIBANK_TEST_CERT_NAMES = [
  "eur-3ds-ecomm-test.int.fibank.bg",
  "eur-3ds-ecomm-test",
] as const;

/**
 * Is this the bank's known test certificate?
 *
 * Takes the raw `subjectaltname` string from the peer certificate. Matching is
 * exact per entry — a substring test would let `evil-eur-3ds-ecomm-test` pass.
 */
export function isFibankTestCertificate(subjectAltName: string | undefined): boolean {
  if (!subjectAltName) return false;
  const names = subjectAltName
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.toUpperCase().startsWith("DNS:"))
    .map((entry) => entry.slice(4).trim().toLowerCase());

  return FIBANK_TEST_CERT_NAMES.some((expected) => names.includes(expected));
}

/* ─── client IP ────────────────────────────────────────────────────────────── */

/**
 * `client_ip_addr` is documented as 15 characters — an IPv4 dotted quad. Behind
 * a proxy the header is a list and may carry an IPv6 address or an
 * IPv4-mapped form (`::ffff:1.2.3.4`); pick the first usable IPv4 and fall back
 * to `0.0.0.0` so a missing header can never abort a payment.
 */
export function normalizeClientIp(forwardedFor: string | null | undefined): string {
  if (!forwardedFor) return "0.0.0.0";
  for (const partRaw of forwardedFor.split(",")) {
    const part = partRaw.trim().replace(/^::ffff:/i, "");
    // Strip a :port suffix, but only when what's left still looks like IPv4.
    const candidate = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(part)
      ? part.slice(0, part.lastIndexOf(":"))
      : part;
    if (isIpv4(candidate)) return candidate;
  }
  return "0.0.0.0";
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
