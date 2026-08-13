import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { settleEcommPaymentForBooking } from "@/lib/payments/ecomm/settlePaymentForBooking";
import {
  ECOMM_BOOKING_COOKIE,
  absoluteUrl,
  clientIpFromRequest,
  describeUnidentifiedReturn,
  resolveReturnBookingId,
} from "@/lib/payments/ecomm/returnLeg";

/**
 * `returnOkUrl` — where Fibank sends the client after 3-D Secure and the
 * transaction complete, **whatever the outcome** (OK, FAILED or DECLINED). The
 * name is the bank's; it does not mean the payment succeeded.
 *
 * The POST body is not authenticated, so nothing here believes it: we look up
 * the booking, ask MerchantHandler for the real result (`command=c`) and write
 * what the bank says. Then a 303 puts the client on a normal GET page.
 *
 * The URL must stay free of query parameters — the bank registers it verbatim.
 */
export async function POST(request: Request) {
  return handleReturn(request);
}

/**
 * Some browsers replay the landing as a GET (back button, or a client that
 * followed a redirect). Settle the same way rather than 405-ing the client into
 * a dead end.
 */
export async function GET(request: Request) {
  return handleReturn(request);
}

async function handleReturn(request: Request) {
  const jar = await cookies();
  const { bookingId, source } = await resolveReturnBookingId(
    request,
    jar.get(ECOMM_BOOKING_COOKIE)?.value,
  );

  // Whatever happens next, this payment is no longer in flight.
  jar.delete(ECOMM_BOOKING_COOKIE);

  if (!bookingId) {
    console.error(
      "[ecomm/return] could not identify the booking —",
      describeUnidentifiedReturn(request),
    );
    return redirectTo(request, "/account?payment=unknown");
  }
  console.log(`[ecomm/return] booking ${bookingId} identified by ${source}`);

  const settled = await settleEcommPaymentForBooking({
    bookingId,
    clientIp: clientIpFromRequest(request),
  });

  if (!settled.ok) {
    console.error("[ecomm/return] settle failed", bookingId, settled.error);
    return redirectTo(request, `/account?payment=error`);
  }

  revalidatePath("/schedule");
  revalidatePath("/account");

  if (settled.status === "paid") {
    return redirectTo(request, `/receipt/${settled.bookingId}`);
  }
  if (settled.status === "pending") {
    return redirectTo(request, `/account?payment=pending`);
  }
  return redirectTo(request, `/account?payment=failed`);
}

/** 303 so the browser turns the bank's POST into a GET of our page. */
function redirectTo(request: Request, path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: absoluteUrl(request, path) },
  });
}
