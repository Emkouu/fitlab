import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Anything under these prefixes requires a signed-in user. Anonymous visitors
 * are redirected to /login?next=<original path>. /schedule and / stay public.
 */
const PROTECTED_PREFIXES = ["/account", "/booking"];

/** /login is for anonymous users; signed-in visitors bounce to /schedule. */
const AUTH_ONLY_PREFIXES = ["/login"];

/**
 * Runs on every request (per matcher). Refreshes the Supabase session cookie
 * so server components see an up-to-date user, then enforces route guards.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the token with Supabase; getSession() only reads the
  // local cookie. Always use getUser() for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (user && AUTH_ONLY_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/schedule";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
