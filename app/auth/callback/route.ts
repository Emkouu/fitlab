import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserFromSupabase } from "@/lib/auth/syncUser";
import { prisma } from "@/lib/db";

/**
 * Magic-link / OTP callback. Supabase posts back here with ?code=...; we
 * exchange the code for a session, ensure a FitLab User row exists, then
 * redirect to ?next (default /schedule).
 *
 * Errors render via a redirect to /login?error=... so the browser stays on
 * branded UI rather than landing on a JSON response.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/schedule";
  // Open redirect guard — never bounce off-origin.
  const next = rawNext.startsWith("/") ? rawNext : "/schedule";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    const reason = error?.message ? encodeURIComponent(error.message) : "exchange_failed";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  try {
    await syncUserFromSupabase(data.user);
  } catch (e) {
    console.error("[auth/callback] syncUserFromSupabase failed", e);
    // Auth still succeeded — let the user through, log the sync failure.
  }

  // First-time users have no fullName yet — send them to /onboarding before
  // the requested destination.
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: data.user.id },
    select: { fullName: true },
  });
  if (!profile?.fullName || profile.fullName.trim() === "") {
    return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
