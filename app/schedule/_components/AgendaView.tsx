import { formatSofiaDay, sofiaDateKey } from "@/lib/format";
import { ClassCard, type ClassCardRow } from "./ClassCard";

// Re-export so other modules can import either path.
export type { ClassCardRow };

// "понеделник, 26.05.2026 г." → ["понеделник", "26.05.2026"]
function splitDay(formatted: string): { weekday: string; date: string } {
  const m = formatted.match(/^([^,]+),\s*(.+?)(?:\s*г\.?)?$/);
  if (!m) return { weekday: formatted, date: "" };
  return { weekday: m[1], date: m[2] };
}

export type DayBucket = { key: string; day: Date | string; rows: ClassCardRow[] };

export function AgendaView({
  days,
  onBook,
}: {
  days: DayBucket[];
  onBook: (row: ClassCardRow) => void;
}) {
  if (days.length === 0) return <EmptyAgenda />;

  return (
    <>
      {days.map(({ key, day, rows }) => {
        const d = typeof day === "string" ? new Date(day) : day;
        const { weekday, date } = splitDay(formatSofiaDay(d));
        return (
          <section key={key} className="mb-8 last:mb-0">
            <header className="mb-3 flex items-end gap-3">
              <span
                aria-hidden
                className="mb-1 h-4 w-1 rounded-full bg-[color:var(--brand-magenta)]"
              />
              <div>
                <h2 className="font-display text-lg font-bold uppercase leading-none tracking-wide">
                  {weekday}
                </h2>
                <p className="mt-1 font-mono text-xs text-[color:var(--brand-purple)]/60">
                  {date}
                </p>
              </div>
            </header>
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <ClassCard key={r.id} row={r} onBook={onBook} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function EmptyAgenda() {
  return (
    <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
      <p className="font-display text-base font-semibold">
        Няма предстоящи класове
      </p>
      <p className="mt-2 text-sm text-[color:var(--brand-purple)]/70">
        Скоро ще обявим новата програма.
      </p>
    </div>
  );
}
