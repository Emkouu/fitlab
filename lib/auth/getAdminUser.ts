import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

export type AdminUser = {
  id: string;
  role: typeof Role.super_admin | typeof Role.admin;
  email: string | null;
};

/**
 * Returns the signed-in FitLab user IFF their role is admin or super_admin.
 * Otherwise returns null. Used for admin dashboard access control.
 *
 * All admin pages should call this at the top level and redirect if null.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
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
  if (profile.role !== Role.super_admin && profile.role !== Role.admin)
    return null;

  return profile as AdminUser;
}

/** Is this role considered admin? Useful for type-narrowing in callers. */
export function isAdminRole(role: Role): boolean {
  return role === Role.super_admin || role === Role.admin;
}
