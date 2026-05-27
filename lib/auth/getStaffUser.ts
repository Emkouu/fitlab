import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

export type StaffUser = {
  id: string;
  role: typeof Role.super_admin | typeof Role.admin | typeof Role.coach;
  trainerId: string | null;
  email: string | null;
};

const STAFF_ROLES: Role[] = [Role.super_admin, Role.admin, Role.coach];

/**
 * Returns the signed-in FitLab user IFF their role is staff (super_admin /
 * admin / coach). Otherwise returns null. Centralised so every staff route
 * + server action goes through the same DB-backed role check — never the
 * client.
 *
 * Note: a coach without a linked Trainer record still passes the role
 * check but cannot scope classes to themselves. The page handles that
 * case explicitly (shows an empty list with a hint).
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, role: true, trainerId: true, email: true },
  });
  if (!profile) return null;
  if (!STAFF_ROLES.includes(profile.role)) return null;

  return profile as StaffUser;
}

/** Is this role considered staff? Useful for type-narrowing in callers. */
export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}
