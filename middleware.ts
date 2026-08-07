import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Skip static assets, Next.js internals, and the payment callbacks.
//
// The Fibank ECOMM return/fail URLs are reached by a cross-site POST from the
// bank and carry no Supabase session, so refreshing one is pure latency — and
// keeping the bank's POST out of the cookie-rewriting path removes a way for it
// to be disturbed.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo\\.png|api/payments/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
