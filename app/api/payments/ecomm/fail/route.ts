import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { settleEcommPaymentForBooking } from "@/lib/payments/ecomm/settlePaymentForBooking";
import {
  ECOMM_BOOKING_COOKIE,
  absoluteUrl,
  clientIpFromRequest,
  resolveReturnBookingId,
} from "@/lib/payments/ecomm/returnLeg";

/**
 * `returnFailUrl` — where Fibank sends the client on a technical failure inside
 * ECOMM or an unsuccessful 3-D Secure authentication.
 *
 * We still ask the bank for the transaction result rather than assuming
 * failure: the point of a single authoritative source (manual §4.2) is that our
 * database never disagrees with the bank, not even about a failure. The only
 * difference from the OK leg is where the client lands.
 *
 * The URL must stay free of query parameters — the bank registers it verbatim.
 */
export async function POST(request: Request) {
  return handleFail(request);
}

export async function GET(request: Request) {
  return handleFail(request);
}

async function handleFail(request: Request) {
  const jar = await cookies();
  const bookingId = await resolveReturnBookingId(
    request,
    jar.get(ECOMM_BOOKING_COOKIE)?.value,
  );
  jar.delete(ECOMM_BOOKING_COOKIE);

  if (!bookingId) {
    console.error("[ecomm/fail] could not identify the booking");
    return redirectTo(request, "/account?payment=unknown");
  }

  const settled = await settleEcommPaymentForBooking({
    bookingId,
    clientIp: clientIpFromRequest(request),
  });

  revalidatePath("/schedule");
  revalidatePath("/account");

  if (!settled.ok) {
    console.error("[ecomm/fail] settle failed", bookingId, settled.error);
    return redirectTo(request, "/account?payment=error");
  }

  // A „fail" landing that the bank nevertheless reports as OK is possible when
  // 3-D Secure stumbles after the transaction cleared — honour the bank.
  if (settled.status === "paid") {
    return redirectTo(request, `/receipt/${settled.bookingId}`);
  }
  return redirectTo(request, "/account?payment=failed");
}

function redirectTo(request: Request, path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: absoluteUrl(request, path) },
  });
}
