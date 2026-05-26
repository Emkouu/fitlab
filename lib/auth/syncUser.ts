import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

/**
 * Make sure a FitLab `User` row exists for the given Supabase auth user and
 * carries the current email/phone. Called from the `/auth/callback` route on
 * every successful sign-in.
 *
 * Lookup precedence (so existing rows are reused, not duplicated):
 *   1. supabaseUserId — once linked, always primary.
 *   2. phone — primary identifier per SPEC §3 / SMS-OTP plan.
 *   3. email — magic-link fallback / first-time sign-in.
 */
export async function syncUserFromSupabase(sbUser: SupabaseUser) {
  const supabaseUserId = sbUser.id;
  // Supabase returns missing email/phone as "" (not null/undefined), but our
  // Postgres unique indexes on phone & email would collide on the empty string.
  // Normalize empty → null so we get proper sparse uniques.
  const blank = (s: string | undefined | null) => (s && s.trim() ? s.trim() : null);
  const email = blank(sbUser.email);
  const phone = blank(sbUser.phone);
  const phoneVerifiedAt = sbUser.phone_confirmed_at
    ? new Date(sbUser.phone_confirmed_at)
    : null;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { supabaseUserId },
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        supabaseUserId, // promote / claim if previously unset
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        phoneVerifiedAt: phoneVerifiedAt ?? existing.phoneVerifiedAt,
      },
    });
  }

  return prisma.user.create({
    data: {
      supabaseUserId,
      email,
      phone,
      phoneVerifiedAt,
      role: "member",
    },
  });
}
