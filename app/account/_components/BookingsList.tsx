"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Booking, ScheduledClass } from "@/lib/generated/prisma/client";
import { BookingCard } from "./BookingCard";

type BookingWithRelations = Booking & {
  scheduledClass: ScheduledClass & {
    practice: { name: string };
    trainers: { id: string; name: string }[];
    studio: { name: string; cancelWindowHours: number; defaultDeposit: number };
  };
};

type Props = {
  upcomingBookings: BookingWithRelations[];
  pastBookings: BookingWithRelations[];
};

export function BookingsList({ upcomingBookings, pastBookings }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [, startTransition] = useTransition();

  /**
   * Re-run the server component (`app/account/page.tsx`) so it pulls
   * fresh booking data from Postgres. The cancelled row will either
   * disappear from "Upcoming" (if it was cancelled inside the window
   * and you treat cancelled as hidden), move to "Past" (if its
   * startAt is already in the past), or simply re-render with the
   * new status badge — whichever the server-side query decides.
   *
   * Just bumping a refreshKey here would only re-mount with the same
   * stale props that were captured at page render time. router.refresh()
   * is the canonical Next.js way to invalidate the server-rendered tree.
   */
  const handleCancelled = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const isEmpty =
    activeTab === "upcoming"
      ? upcomingBookings.length === 0
      : pastBookings.length === 0;

  const bookings =
    activeTab === "upcoming" ? upcomingBookings : pastBookings;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-3 border-b border-[color:var(--brand-purple)]/10">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`px-3 py-2 font-display text-sm font-bold uppercase tracking-wider transition-colors ${
            activeTab === "upcoming"
              ? "border-b-2 border-[color:var(--brand-magenta)] text-[color:var(--brand-magenta)]"
              : "text-[color:var(--brand-purple)]/50 hover:text-[color:var(--brand-purple)]/70"
          }`}
        >
          Предстоящи ({upcomingBookings.length})
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`px-3 py-2 font-display text-sm font-bold uppercase tracking-wider transition-colors ${
            activeTab === "past"
              ? "border-b-2 border-[color:var(--brand-magenta)] text-[color:var(--brand-magenta)]"
              : "text-[color:var(--brand-purple)]/50 hover:text-[color:var(--brand-purple)]/70"
          }`}
        >
          Минали ({pastBookings.length})
        </button>
      </div>

      {/* Content */}
      {isEmpty ? (
        activeTab === "upcoming" ? (
          <div className="rounded-2xl bg-[#FFF0F8] px-5 py-8 text-center">
            <p className="text-3xl" aria-hidden>
              🏃‍♀️
            </p>
            <p className="mt-3 font-display text-base font-bold text-[color:var(--brand-ink)]">
              Все още нямаш запазени тренировки
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/75">
              Разгледай графика и запази първата си тренировка — депозитът
              остава по профила ти, стига да се отпишеш навреме.
            </p>
            <Link
              href="/schedule"
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)]"
            >
              Виж графика →
            </Link>
          </div>
        ) : (
          <p className="px-1 py-4 text-sm text-[color:var(--brand-purple)]/65">
            Все още нямаш минали тренировки.
          </p>
        )
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              isPast={activeTab === "past"}
              onCancelled={handleCancelled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
