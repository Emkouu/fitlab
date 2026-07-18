import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Heartbeat } from "./_components/Heartbeat";
import { PaymentLogos } from "./_components/PaymentLogos";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: {
      name: true,
      address: true,
      phone: true,
      facebookUrl: true,
      instagramUrl: true,
      cardPaymentsEnabled: true,
    },
  });
  const studioName = studio?.name ?? "FitLab Varna";
  const address = studio?.address ?? null;
  const phone = studio?.phone ?? null;
  const facebookUrl = studio?.facebookUrl ?? null;
  const instagramUrl = studio?.instagramUrl ?? null;
  const phoneHref = phone ? `tel:${phone.replace(/\s+/g, "")}` : null;
  const mapHref = address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : null;
  const hasInfo = address || phone || facebookUrl || instagramUrl;

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

      {/* Studio info */}
      {hasInfo && (
        <section className="mt-12 w-full max-w-[300px] border-t border-gray-100 pt-8 text-center">
          <h2 className="font-display text-base font-bold tracking-wide text-gray-800">
            {studioName}
          </h2>
          {address && mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-sm text-gray-500 hover:text-[color:var(--brand-magenta)] transition-colors"
            >
              📍 {address}
            </a>
          )}
          {phone && phoneHref && (
            <a
              href={phoneHref}
              className="mt-2 block text-sm text-gray-500 hover:text-[color:var(--brand-magenta)] transition-colors"
            >
              {phone}
            </a>
          )}

          {(facebookUrl || instagramUrl) && (
            <div className="mt-5 flex items-center justify-center gap-5">
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="text-[color:var(--brand-magenta)] transition-transform hover:scale-110"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0022 12z" />
                  </svg>
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="text-[color:var(--brand-magenta)] transition-transform hover:scale-110"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2c2.72 0 3.06.01 4.12.06 1.07.05 1.79.22 2.43.46.66.26 1.22.6 1.77 1.16.56.55.9 1.11 1.16 1.77.24.64.41 1.36.46 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.07-.22 1.79-.46 2.43-.26.66-.6 1.22-1.16 1.77-.55.56-1.11.9-1.77 1.16-.64.24-1.36.41-2.43.46-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.07-.05-1.79-.22-2.43-.46a4.9 4.9 0 01-1.77-1.16 4.9 4.9 0 01-1.16-1.77c-.24-.64-.41-1.36-.46-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.07.22-1.79.46-2.43.26-.66.6-1.22 1.16-1.77.55-.56 1.11-.9 1.77-1.16.64-.24 1.36-.41 2.43-.46C8.94 2.01 9.28 2 12 2zm0 1.8c-2.67 0-2.99.01-4.04.06-.98.04-1.51.21-1.86.34-.47.18-.8.4-1.15.75-.35.35-.57.68-.75 1.15-.13.35-.3.88-.34 1.86-.05 1.05-.06 1.37-.06 4.04s.01 2.99.06 4.04c.04.98.21 1.51.34 1.86.18.47.4.8.75 1.15.35.35.68.57 1.15.75.35.13.88.3 1.86.34 1.05.05 1.37.06 4.04.06s2.99-.01 4.04-.06c.98-.04 1.51-.21 1.86-.34.47-.18.8-.4 1.15-.75.35-.35.57-.68.75-1.15.13-.35.3-.88.34-1.86.05-1.05.06-1.37.06-4.04s-.01-2.99-.06-4.04c-.04-.98-.21-1.51-.34-1.86a3.1 3.1 0 00-.75-1.15 3.1 3.1 0 00-1.15-.75c-.35-.13-.88-.3-1.86-.34-1.05-.05-1.37-.06-4.04-.06zm0 3.06a5.14 5.14 0 110 10.28 5.14 5.14 0 010-10.28zm0 8.48a3.34 3.34 0 100-6.68 3.34 3.34 0 000 6.68zm6.54-8.69a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </section>
      )}

      {/* Card acceptance marks — required on the landing page while card
          payments are on (Fibank §I.2); hidden with the admin kill-switch so
          the site never advertises a payment method it refuses. */}
      <section className="mt-10 w-full max-w-[300px] text-center">
        {(studio?.cardPaymentsEnabled ?? true) && (
          <>
            <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Приемаме плащания с
            </p>
            <PaymentLogos />
          </>
        )}
        <Link
          href="/policies"
          className="mt-5 inline-block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60 transition-colors hover:text-[color:var(--brand-magenta)]"
        >
          Политики
        </Link>
      </section>
    </main>
  );
}
