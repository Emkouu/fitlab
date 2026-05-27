import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Heartbeat } from "./_components/Heartbeat";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-[#fdfafd] flex flex-col items-center justify-center px-5 font-sans">
      {/* Logo */}
      <Link href="/" className="mb-12 block hover:opacity-80 transition-opacity">
        <Image
          src="/logo.png"
          alt="FitLab Varna"
          width={200}
          height={100}
          priority
          className="h-24 w-auto"
        />
      </Link>

      <Heartbeat className="mb-12 h-3 w-40 opacity-90" />

      {/* Buttons */}
      <div className="w-full max-w-[300px] space-y-3">
        {/* Login / Profile Button */}
        <Link
          href={user ? "/account" : "/login"}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
        >
          {user ? "Профил" : "Вход"}
        </Link>

        {/* Schedule Button */}
        <Link
          href="/schedule"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-[color:var(--brand-magenta)] bg-white px-5 py-3 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
        >
          График
        </Link>
      </div>
    </main>
  );
}
