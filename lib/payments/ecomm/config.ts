/**
 * Fibank ECOMM configuration.
 *
 * Two endpoints, from `ECOMM_addresses_for_communication.txt`:
 *   MerchantHandler — server-to-server, mutual TLS with the bank-issued
 *                     keystore. This is where we register transactions, read
 *                     results and issue refunds.
 *   ClientHandler   — where the *client's browser* is POSTed with `trans_id`
 *                     to type the card details on the bank's own page.
 *
 * The keystore never lands in the repo: it arrives from the bank as a PKCS#12
 * file and is stored base64-encoded in `ECOMM_CERT_PFX_BASE64` (Vercel
 * environment variable), with its password in `ECOMM_CERT_PASSWORD`.
 *
 * Nothing here throws at module load — the card path has to be able to report
 * „плащането с карта е недостъпно" rather than take the whole app down when the
 * bank credentials are missing (which is the state until the bank enables us).
 */

export type EcommEnvironment = "test" | "production";

const ENDPOINTS: Record<EcommEnvironment, { merchant: string; client: string }> = {
  test: {
    merchant: "https://mdpay-test.fibank.bg:10443/ecomm_v2/MerchantHandler",
    client: "https://mdpay-test.fibank.bg/ecomm_v2/ClientHandler",
  },
  production: {
    merchant: "https://mdpay.fibank.bg:10443/ecomm_v2/MerchantHandler",
    client: "https://mdpay.fibank.bg/ecomm_v2/ClientHandler",
  },
};

export type EcommConfig = {
  environment: EcommEnvironment;
  /** Server-to-server endpoint (mutual TLS). */
  merchantUrl: string;
  /** Browser POST target for card entry. */
  clientUrl: string;
  /** PKCS#12 keystore issued by the bank. */
  pfx: Buffer;
  passphrase: string;
};

/** Why the card path is unavailable — surfaced in logs, never to the client. */
export type EcommConfigError = { ok: false; reason: string };

export type EcommConfigResult = ({ ok: true } & EcommConfig) | EcommConfigError;

/**
 * Read and validate the ECOMM configuration. Call this instead of reaching for
 * `process.env` — it is the only place that knows which variables exist.
 */
export function getEcommConfig(): EcommConfigResult {
  const environment: EcommEnvironment =
    process.env.ECOMM_ENVIRONMENT === "production" ? "production" : "test";

  const endpoints = ENDPOINTS[environment];
  const merchantUrl = process.env.ECOMM_MERCHANT_URL?.trim() || endpoints.merchant;
  const clientUrl = process.env.ECOMM_CLIENT_URL?.trim() || endpoints.client;

  const pfxBase64 = process.env.ECOMM_CERT_PFX_BASE64?.trim();
  if (!pfxBase64) {
    return { ok: false, reason: "ECOMM_CERT_PFX_BASE64 is not set" };
  }
  const passphrase = process.env.ECOMM_CERT_PASSWORD;
  if (!passphrase) {
    return { ok: false, reason: "ECOMM_CERT_PASSWORD is not set" };
  }

  let pfx: Buffer;
  try {
    pfx = Buffer.from(pfxBase64, "base64");
  } catch {
    return { ok: false, reason: "ECOMM_CERT_PFX_BASE64 is not valid base64" };
  }
  if (pfx.byteLength === 0) {
    return { ok: false, reason: "ECOMM_CERT_PFX_BASE64 decoded to an empty buffer" };
  }

  return { ok: true, environment, merchantUrl, clientUrl, pfx, passphrase };
}

/** Is the card path wired up at all? Used by the UI kill-switch logic. */
export function isEcommConfigured(): boolean {
  return getEcommConfig().ok;
}

/**
 * The ClientHandler URL, even when the keystore is absent — the auto-POST page
 * needs it and knowing the endpoint doesn't require credentials.
 */
export function ecommClientUrl(): string {
  const environment: EcommEnvironment =
    process.env.ECOMM_ENVIRONMENT === "production" ? "production" : "test";
  return process.env.ECOMM_CLIENT_URL?.trim() || ENDPOINTS[environment].client;
}
