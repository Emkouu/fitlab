import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

export type StaffUser = {
  id: string;
  role: typeof Role.super_admin | typeof Role.admin | typeof Role.coach;
  email: string | null;
};

/**
 * Returns the signed-in FitLab user IFF their role is admin, super_admin or
 * coach. Otherwise returns null.
 *
 * Coaches get a REDUCED panel: schedule view (read-only), attendance
 * marking, and adding clients. Anything financial or destructive stays
 * behind `getAdminUser()` — pages that allow coaches must check
 * `staff.role === Role.coach` before rendering admin-only affordances.
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, role: true, email: true },
  });
  if (!profile) return null;
  if (
    profile.role !== Role.super_admin &&
    profile.role !== Role.admin &&
    profile.role !== Role.coach
  )
    return null;

  return profile as StaffUser;
}
