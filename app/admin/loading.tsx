import { Spinner } from "@/app/_components/Spinner";

/**
 * Segment-level loading state for every /admin/* navigation. Admin pages are
 * dynamic server components (role check + Prisma per request), so without
 * this the screen stays frozen until the RSC payload lands.
 */
export default function AdminLoading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[440px] flex-col items-center justify-center gap-3 px-5 font-sans">
      <Spinner size={36} />
      <p className="font-display text-xs font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        Зареждане…
      </p>
    </main>
  );
}
