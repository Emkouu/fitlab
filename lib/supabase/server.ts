import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads & writes the session cookie via Next.js's cookies() API. Must be
 * awaited because cookies() is async in Next 16.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where mutating cookies is not allowed.
            // Middleware refreshes the session, so this is safe to swallow.
          }
        },
      },
    },
  );
}
