import Image from "next/image";

export type TrainerCardRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  specialties: { id: string; name: string }[];
};

/**
 * Client-facing trainers directory: photo, name, a short bio and the
 * practices each trainer specialises in. Read-only — the admin panel
 * (`/admin/trainers`) is the source of truth for this content.
 */
export function TrainersSection({ trainers }: { trainers: TrainerCardRow[] }) {
  if (trainers.length === 0) return null;

  return (
    <ul className="space-y-3">
      {trainers.map((t) => (
        <li
          key={t.id}
          className="flex gap-4 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]"
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[color:var(--brand-pink-soft)] ring-1 ring-[color:var(--brand-pink)]/40">
            {t.photoUrl ? (
              <Image
                src={t.photoUrl}
                alt={t.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-xl font-bold text-[color:var(--brand-magenta)]">
                {initials(t.name)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold tracking-tight text-[color:var(--brand-ink)]">
              {t.name}
            </p>

            {t.specialties.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {t.specialties.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-[color:var(--brand-pink-soft)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-purple)]"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            {t.bio && (
              <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--brand-purple)]/75">
                {t.bio}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
