import { normalizeClientIp } from "./protocol";

/**
 * Shared plumbing for the two URLs we register with the bank:
 *
 *   returnOkUrl   → /api/payments/ecomm/return
 *   returnFailUrl → /api/payments/ecomm/fail
 *
 * Both are reached by a cross-site **POST** from ECOMM and, per the bank's
 * configuration instructions, must carry no query parameters — which is why the
 * booking is identified from the request body (the `booking_id` we attach to the
 * outgoing form; §4.4 promises extra parameters are handed back) or from the
 * `ecomm_booking` cookie set when the payment started.
 *
 * The body is untrusted input: a wrong or forged `booking_id` only causes us to
 * re-ask the bank about that booking's own transaction, and the bank's answer is
 * what we write. The cookie is preferred when present because it is ours.
 */

/** Name of the cookie that remembers which booking is mid-payment. */
export const ECOMM_BOOKING_COOKIE = "ecomm_booking";

/**
 * Cookie options for the pending-payment marker.
 *
 * `sameSite: "none"` is required: the bank POSTs to us from its own origin, and
 * a Lax cookie is not sent on a cross-site POST. That in turn requires
 * `secure`, so on plain-http localhost the cookie is simply absent and the
 * `booking_id` form field carries the identification instead.
 */
export const ECOMM_BOOKING_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
  maxAge: 60 * 60, // one hour — longer than any card session
} as const;

/** Pull the booking id out of a return POST. Cookie first, then the body. */
export async function resolveReturnBookingId(
  request: Request,
  cookieValue: string | undefined,
): Promise<string | null> {
  if (cookieValue && cookieValue.trim() !== "") return cookieValue.trim();

  try {
    const form = await request.formData();
    const fromBody = form.get("booking_id");
    if (typeof fromBody === "string" && fromBody.trim() !== "") return fromBody.trim();
  } catch {
    // Not form-encoded — nothing to read.
  }
  return null;
}

/** Client IP for `command=c`, from the proxy headers of the return request. */
export function clientIpFromRequest(request: Request): string {
  return normalizeClientIp(
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
  );
}

/** Absolute URL on our own origin, for the 303 that ends the return leg. */
export function absoluteUrl(request: Request, path: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`).toString();
}
