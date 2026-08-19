import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserFromSupabase } from "@/lib/auth/syncUser";
import { safeNextPath } from "@/lib/auth/safeNext";
import { isProfileComplete, onboardingPathFor } from "@/lib/auth/profileComplete";
import { prisma } from "@/lib/db";

/**
 * Called by the login form after `verifyOtp` establishes a session. Upserts
 * the FitLab User row and decides whether to send the user to onboarding or
 * their intended destination.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { next?: string };
  const next = safeNextPath(body.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    await syncUserFromSupabase(user);
  } catch (e) {
    console.error("[auth/sync] syncUserFromSupabase failed", e);
  }

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { fullName: true, phone: true },
  });

  const redirect = isProfileComplete(profile) ? next : onboardingPathFor(next);

  return NextResponse.json({ redirect });
}
