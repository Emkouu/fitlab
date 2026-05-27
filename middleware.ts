import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Skip static assets, Next.js internals, and the Stripe webhook (signed by
// Stripe, doesn't need a Supabase session round-trip).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo\\.png|api/stripe/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
