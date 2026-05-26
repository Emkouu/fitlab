import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Small auth-status chip in the schedule header.
 * - Anonymous → "Вход" link to /login.
 * - Signed-in → "Профил" link to /account.
 * Rendered as a server component so the cookie read happens in one place.
 */
export async function AuthChip() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)] shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_12px_-6px_rgba(236,72,153,0.2)] transition-colors hover:text-[color:var(--brand-magenta)]"
      >
        <Dot />
        Профил
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-magenta)] px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
    >
      Вход
    </Link>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--brand-magenta)]"
    />
  );
}
