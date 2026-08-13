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

/** Where the booking id came from — `none` means neither path had it. */
export type ReturnBookingSource = "cookie" | "body" | "none";

export type ResolvedReturnBooking = {
  bookingId: string | null;
  source: ReturnBookingSource;
};

/** Pull the booking id out of a return POST. Cookie first, then the body. */
export async function resolveReturnBookingId(
  request: Request,
  cookieValue: string | undefined,
): Promise<ResolvedReturnBooking> {
  if (cookieValue && cookieValue.trim() !== "") {
    return { bookingId: cookieValue.trim(), source: "cookie" };
  }

  try {
    const form = await request.formData();
    const fromBody = form.get("booking_id");
    if (typeof fromBody === "string" && fromBody.trim() !== "") {
      return { bookingId: fromBody.trim(), source: "body" };
    }
  } catch {
    // Not form-encoded — nothing to read.
  }
  return { bookingId: null, source: "none" };
}

/**
 * What to print when neither path identified a booking.
 *
 * A bare `could not identify the booking` cannot be acted on: a client whose
 * payment we just lost and a scanner probing the registered URL produce the
 * identical line. These four facts separate them — the bank always arrives as a
 * cross-site form POST, so a GET with no body and no cookie is somebody else.
 * No client data is logged; the user agent is the request's own header.
 */
export function describeUnidentifiedReturn(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "<no user-agent>";
  return [
    `method=${request.method}`,
    `content-type=${request.headers.get("content-type") ?? "<none>"}`,
    `cookie-header=${request.headers.get("cookie") ? "present" : "absent"}`,
    `ua=${ua.slice(0, 120)}`,
  ].join(" ");
}

/** Client IP for `command=c`, from the proxy headers of the return request. */
export function clientIpFromRequest(request: Request): string {
  return normalizeClientIp(
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
  );
}

/**
 * Absolute URL on our own origin, for the 303 that ends the return leg.
 *
 * `NEXT_PUBLIC_APP_URL` wins when it is set: behind our own nginx the
 * `X-Forwarded-*` headers are only as trustworthy as the proxy config, and the
 * canonical origin is something we already know. The headers stay as a fallback
 * for local development, where the variable points at localhost or is absent.
 */
export function absoluteUrl(request: Request, path: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return new URL(path, configured).toString();

  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`).toString();
}
