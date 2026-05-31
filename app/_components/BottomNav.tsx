"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  Icon: React.FC<{ className?: string }>;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Начало",
    isActive: (p) => p === "/",
    Icon: HomeIcon,
  },
  {
    href: "/schedule",
    label: "График",
    isActive: (p) => p.startsWith("/schedule"),
    Icon: CalendarIcon,
  },
  {
    href: "/account",
    label: "Моите",
    isActive: (p) => p.startsWith("/account"),
    Icon: PersonIcon,
  },
];

const HIDDEN_PREFIXES = ["/admin", "/login", "/onboarding", "/auth"];

export function BottomNav({
  unreadCount = 0,
}: {
  unreadCount?: number;
}) {
  const pathname = usePathname() ?? "/";
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      aria-label="Основна навигация"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-3 border-t border-[#F3E8FF] bg-white shadow-[0_-4px_12px_rgba(236,72,153,0.08)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const active = t.isActive(pathname);
        const showBadge = t.href === "/account" && unreadCount > 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-16 flex-col items-center justify-center gap-1 transition-colors ${
              active
                ? "text-[color:var(--brand-magenta)]"
                : "text-[#9CA3AF] hover:text-[color:var(--brand-purple)]"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-1/2 top-0 h-[2px] w-10 -translate-x-1/2 rounded-full bg-[color:var(--brand-magenta)]"
              />
            )}
            <span className="relative">
              <t.Icon className="h-6 w-6" />
              {showBadge && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                />
              )}
            </span>
            <span className="font-display text-[10px] font-bold uppercase tracking-wider">
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PersonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
