"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboardingForm";

type Result = { ok: true } | { ok: false; message: string };

export async function completeOnboardingAction(input: OnboardingInput): Promise<Result> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Невалидни данни." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Не си влязъл/а." };

  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true },
  });
  if (!profile) return { ok: false, message: "Профилът не е намерен." };

  try {
    await prisma.user.update({
      where: { id: profile.id },
      data: {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
      },
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return { ok: false, message: "Този телефон вече е свързан с друг профил." };
    }
    console.error("[onboarding] update failed", e);
    return { ok: false, message: "Възникна грешка. Опитай отново." };
  }

  return { ok: true };
}
