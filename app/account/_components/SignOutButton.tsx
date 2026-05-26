"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/schedule");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)] focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {busy ? "Излизане…" : "Изход"}
    </button>
  );
}
