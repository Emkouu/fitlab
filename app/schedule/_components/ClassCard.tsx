import { BookButton } from "./BookButton";
import { formatSofiaTime } from "@/lib/format";

/**
 * Shared class card used by both the agenda list and the week column view.
 * The card itself is a server-renderable component; only <BookButton/> ships
 * client-side because it owns the placeholder tap state.
 */
export type ClassCardRow = {
  id: string;
  startAt: Date | string;
  durationMinutes: number;
  capacity: number;
  eventNotes: string | null;
  depositAmount: number;
  cancelledAt: Date | string | null;
  practice: { name: string };
  trainers: { name: string }[];
  studio: { name: string; cancelWindowHours: number };
  _count: { bookings: number };
};

export function ClassCard({
  row,
  compact = false,
  onBook,
}: {
  row: ClassCardRow;
  /** Tighter spacing for the dense week view. */
  compact?: boolean;
  /** Called when the user taps „Избор". Owner (ScheduleSurface) decides
   *  whether to open the modal (auth'd) or bounce to /login. */
  onBook: (row: ClassCardRow) => void;
}) {
  const remaining = row.capacity - row._count.bookings;
  const full = remaining <= 0;
  // Normalize Date | string (boundary serialization may strip the Date prototype)
  const startAt = typeof row.startAt === "string" ? new Date(row.startAt) : row.startAt;
  const isPast = startAt.getTime() < Date.now();
  const isCancelled = row.cancelledAt !== null && row.cancelledAt !== undefined;

  return (
    <li
      className={`group overflow-hidden rounded-2xl bg-white transition-shadow ${
        isCancelled
          ? "opacity-50 shadow-none"
          : isPast
            ? "opacity-60 shadow-none"
            : "shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)] hover:shadow-[0_1px_2px_rgba(123,45,142,0.06),0_8px_24px_-8px_rgba(236,72,153,0.28)]"
      }`}
    >
      <div className="relative">
        {/* Heartbeat-echo accent bar — content zone only, never under the CTA.
            Past classes get a muted bar so the brand signature still appears
            but doesn't read as "alive". Cancelled classes get an even more muted bar. */}
        <span
          aria-hidden
          className={`absolute inset-y-3 left-0 w-[3px] rounded-full ${
            isCancelled
              ? "bg-[color:var(--brand-purple)]/10"
              : isPast
                ? "bg-[color:var(--brand-purple)]/20"
                : "bg-gradient-to-b from-[color:var(--brand-magenta)] to-[color:var(--brand-pink)]"
          }`}
        />

        <div className={`flex items-start gap-3 ${compact ? "px-4 pb-3 pt-3" : "gap-4 px-5 pb-4 pt-4"}`}>
          {/* Time block */}
          <div className="shrink-0 pt-0.5">
            <div
              className={`font-display font-bold leading-none tracking-tight text-[color:var(--brand-magenta)] ${compact ? "text-xl" : "text-2xl"}`}
            >
              {formatSofiaTime(startAt)}
            </div>
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/55">
              {row.durationMinutes} мин
            </div>
          </div>

          {/* Title + trainer */}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              className={`font-display font-semibold leading-tight tracking-tight ${compact ? "text-[14px]" : "text-[15px]"} ${
                isCancelled ? "line-through text-[color:var(--brand-purple)]/50" : ""
              }`}
            >
              {row.practice.name}
            </h3>
            <p
              className={`mt-1 truncate text-sm ${
                isCancelled
                  ? "text-[color:var(--brand-purple)]/35"
                  : "text-[color:var(--brand-purple)]/75"
              }`}
            >
              {row.trainers.map((t) => t.name).join(" & ")}
            </p>
          </div>

          {/* Capacity pill */}
          <div className="shrink-0 pt-0.5">
            {full ? (
              <span className="inline-flex items-center rounded-full bg-[color:var(--brand-magenta)] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">
                Пълен
              </span>
            ) : (
              <span className="inline-flex items-baseline gap-1 rounded-full bg-[color:var(--brand-pink-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--brand-purple)]">
                <span className="font-display font-bold text-[color:var(--brand-magenta)]">
                  {remaining}
                </span>
                <span className="text-[10px] uppercase tracking-wider">места</span>
              </span>
            )}
          </div>
        </div>

        {row.eventNotes && (
          <div className="flex items-stretch border-t border-[color:var(--brand-pink)]/40 bg-[color:var(--brand-pink-soft)]">
            <span aria-hidden className="w-[3px] shrink-0 bg-[color:var(--brand-magenta)]" />
            <p className="px-4 py-2.5 text-[12px] leading-snug text-[color:var(--brand-purple)]">
              {row.eventNotes}
            </p>
          </div>
        )}
      </div>

      {isCancelled ? (
        <div className="flex w-full items-center justify-center gap-2 bg-[color:var(--brand-ink)]/10 px-5 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-ink)]/50">
          Отказано
        </div>
      ) : isPast ? (
        <div className="flex w-full items-center justify-center gap-2 bg-[color:var(--brand-pink-soft)]/60 px-5 py-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/55">
          Класът приключи
        </div>
      ) : full ? (
        <div className="flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--brand-pink-soft)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-magenta)]/70">
          Класът е пълен
        </div>
      ) : (
        <BookButton onClick={() => onBook(row)} />
      )}
    </li>
  );
}
