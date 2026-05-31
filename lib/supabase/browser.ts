"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components. Reads cookies set by the server/middleware
 * so the session is consistent across SSR + CSR.
 *
 * Uses `implicit` flow so magic links work cross-browser: the link carries the
 * full token in the URL hash instead of a PKCE code tied to the originating
 * browser session.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { flowType: "implicit" },
    },
  );
}
