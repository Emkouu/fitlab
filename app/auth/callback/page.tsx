"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Spinner } from "@/app/_components/Spinner";

/**
 * Magic-link callback. With implicit flow Supabase puts the token in the URL
 * hash (#access_token=…), so the session is established client-side by
 * `@supabase/ssr`'s `detectSessionInUrl`. We listen for SIGNED_IN, then call
 * our server route to upsert the FitLab user and decide where to send them.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") ?? "/schedule";
  const next = rawNext.startsWith("/") ? rawNext : "/schedule";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let done = false;

    async function finish() {
      if (done) return;
      done = true;
      try {
        const res = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ next }),
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json()) as { redirect: string };
        router.replace(data.redirect);
      } catch {
        setFailed(true);
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        void finish();
      }
    });

    // If detectSessionInUrl already ran before our listener attached, fall back
    // to a direct check.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finish();
    });

    const timeout = setTimeout(() => {
      if (!done) setFailed(true);
    }, 5000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, next]);

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfafd] px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-lg font-bold text-[color:var(--brand-ink)]">
            Линкът е изтекъл или е вече използван.
          </h1>
          <p className="mt-2 text-sm text-[color:var(--brand-purple)]/75">
            Моля, поискай нов линк за вход.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 font-display text-sm font-bold uppercase tracking-wider text-white hover:bg-[color:var(--brand-purple)]"
          >
            Поискай нов линк →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fdfafd]">
      <Spinner size={40} />
      <p className="mt-4 text-sm text-gray-400">Влизане...</p>
    </div>
  );
}
