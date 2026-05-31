"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components. Reads cookies set by the server/middleware
 * so the session is consistent across SSR + CSR.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
