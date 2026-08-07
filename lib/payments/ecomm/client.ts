import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { getEcommConfig } from "./config";
import {
  ECOMM_CURRENCY_EUR,
  ECOMM_LANGUAGE_BG,
  formatEcommAmount,
  parseEcommResponse,
  sanitizeEcommDescription,
  type EcommResponse,
} from "./protocol";

/**
 * Fibank ECOMM transport + the four commands we use.
 *
 * The connection is mutual TLS: the bank identifies us by the PKCS#12 keystore
 * it issued, so `fetch` is not an option (undici won't take a client
 * certificate without extra plumbing) — we go straight to `node:https`, which
 * accepts `pfx`/`passphrase` on the request options.
 *
 * Commands (integration manual §4):
 *   v — register a transaction for payment (SMS), returns TRANSACTION_ID
 *   c — read the transaction result after the client comes back
 *   k — refund to the same card
 *   r — reverse (void) a transaction that hasn't been cleared yet
 *
 * Every call returns a discriminated result instead of throwing on a bank-level
 * error, because "the bank said no" is a normal outcome the booking flow has to
 * render, not an exception.
 */

/** Milliseconds we're willing to wait for the bank. */
const TIMEOUT_MS = 20_000;

export type EcommCallResult =
  | { ok: true; fields: Record<string, string>; raw: string }
  | { ok: false; error: string; raw?: string };

/** POST a command to MerchantHandler over mutual TLS and parse the reply. */
async function callEcomm(params: Record<string, string>): Promise<EcommCallResult> {
  const config = getEcommConfig();
  if (!config.ok) {
    return { ok: false, error: `ECOMM not configured: ${config.reason}` };
  }

  const body = new URLSearchParams(params).toString();
  const url = new URL(config.merchantUrl);

  let raw: string;
  try {
    raw = await postWithClientCertificate({
      url,
      body,
      pfx: config.pfx,
      passphrase: config.passphrase,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ECOMM transport failure: ${message}` };
  }

  const parsed: EcommResponse = parseEcommResponse(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, raw };
  return { ok: true, fields: parsed.fields, raw };
}

function postWithClientCertificate(args: {
  url: URL;
  body: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<string> {
  const { url, body, pfx, passphrase } = args;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        pfx,
        passphrase,
        // Force IPv4. The bank whitelists our server's IPv4 address, and a
        // dual-stack host (every Hetzner box) may otherwise pick IPv6 for the
        // outgoing connection — the bank would then see an address it doesn't
        // know and reject the call.
        family: 4,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body).toString(),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          // ECOMM signals application errors in the body, not the status line,
          // but a 5xx with an empty body still has to surface as a failure.
          if ((res.statusCode ?? 0) >= 400 && text.trim() === "") {
            reject(new Error(`HTTP ${res.statusCode} with empty body`));
            return;
          }
          resolve(text);
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`timed out after ${TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/* ─── command=v — register a transaction ───────────────────────────────────── */

export type RegisterTransactionInput = {
  /** Amount in EUR minor units (cents). */
  amountMinor: number;
  /** Client's IPv4 address — see `normalizeClientIp`. */
  clientIp: string;
  /** Human description; transliterated and truncated for the bank. */
  description: string;
};

export type RegisterTransactionResult =
  | { ok: true; transId: string }
  | { ok: false; error: string };

/**
 * Register a payment transaction and get the identifier the client's browser
 * must carry to the bank's card-entry page.
 */
export async function registerTransaction(
  input: RegisterTransactionInput,
): Promise<RegisterTransactionResult> {
  const result = await callEcomm({
    command: "v",
    amount: formatEcommAmount(input.amountMinor),
    currency: ECOMM_CURRENCY_EUR,
    client_ip_addr: input.clientIp,
    description: sanitizeEcommDescription(input.description),
    language: ECOMM_LANGUAGE_BG,
    msg_type: "SMS",
  });

  if (!result.ok) return { ok: false, error: result.error };

  const transId = result.fields.TRANSACTION_ID;
  if (!transId) {
    return { ok: false, error: "ECOMM did not return a TRANSACTION_ID" };
  }
  return { ok: true, transId };
}

/* ─── command=c — transaction result ───────────────────────────────────────── */

export type TransactionResult = {
  /** RESULT — the ONLY field that decides success (manual §4.2). */
  result: string;
  resultCode?: string;
  threeDSecure?: string;
  rrn?: string;
  approvalCode?: string;
  cardMask?: string;
  /** Everything the bank sent, preserved verbatim as the manual requires. */
  fields: Record<string, string>;
};

export type GetTransactionResultOutcome =
  | ({ ok: true } & TransactionResult)
  | { ok: false; error: string };

/** Ask the bank what happened to a transaction. */
export async function getTransactionResult(args: {
  transId: string;
  clientIp: string;
}): Promise<GetTransactionResultOutcome> {
  const result = await callEcomm({
    command: "c",
    trans_id: args.transId,
    client_ip_addr: args.clientIp,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const { fields } = result;
  if (!fields.RESULT) {
    return { ok: false, error: "ECOMM result carried no RESULT field" };
  }

  return {
    ok: true,
    result: fields.RESULT,
    resultCode: fields.RESULT_CODE,
    threeDSecure: fields["3DSECURE"],
    rrn: fields.RRN,
    approvalCode: fields.APPROVAL_CODE,
    cardMask: fields.CARD_NUMBER,
    fields,
  };
}

/* ─── command=k — refund to the same card ──────────────────────────────────── */

export type RefundOutcome =
  | { ok: true; refundTransId?: string; resultCode?: string }
  | { ok: false; error: string; resultCode?: string };

/**
 * Refund a settled transaction back to the card it was paid with — the
 * mechanism the acquirer requires the site to have (instruction §I.16).
 *
 * `amountMinor` may be omitted for a full refund.
 */
export async function refundTransaction(args: {
  transId: string;
  amountMinor?: number;
}): Promise<RefundOutcome> {
  const params: Record<string, string> = { command: "k", trans_id: args.transId };
  if (args.amountMinor !== undefined) {
    params.amount = formatEcommAmount(args.amountMinor);
  }

  const result = await callEcomm(params);
  if (!result.ok) return { ok: false, error: result.error };

  const { fields } = result;
  if (fields.RESULT !== "OK") {
    return {
      ok: false,
      error: `refund not accepted: RESULT=${fields.RESULT ?? "<missing>"}`,
      resultCode: fields.RESULT_CODE,
    };
  }
  return {
    ok: true,
    refundTransId: fields.REFUND_TRANS_ID,
    resultCode: fields.RESULT_CODE,
  };
}

/* ─── command=r — reversal ─────────────────────────────────────────────────── */

export type ReversalOutcome =
  | { ok: true; alreadyReversed: boolean; resultCode?: string }
  | { ok: false; error: string; resultCode?: string };

/**
 * Reverse (void) a transaction. Used when the same-day authorisation should
 * never have been taken at all — a refund (`command=k`) is the right tool once
 * the transaction has cleared.
 */
export async function reverseTransaction(args: {
  transId: string;
  amountMinor?: number;
}): Promise<ReversalOutcome> {
  const params: Record<string, string> = { command: "r", trans_id: args.transId };
  if (args.amountMinor !== undefined) {
    params.amount = formatEcommAmount(args.amountMinor);
  }

  const result = await callEcomm(params);
  if (!result.ok) return { ok: false, error: result.error };

  const { fields } = result;
  if (fields.RESULT === "OK") {
    return { ok: true, alreadyReversed: false, resultCode: fields.RESULT_CODE };
  }
  if (fields.RESULT === "REVERSED") {
    return { ok: true, alreadyReversed: true, resultCode: fields.RESULT_CODE };
  }
  return {
    ok: false,
    error: `reversal not accepted: RESULT=${fields.RESULT ?? "<missing>"}`,
    resultCode: fields.RESULT_CODE,
  };
}
