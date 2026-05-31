"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getNotificationsAction,
  markNotificationsReadAction,
  type NotificationRow,
} from "../_actions";

export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const rows = await getNotificationsAction();
    setItems(rows);
    const unreadIds = rows.filter((r) => !r.read).map((r) => r.id);
    if (unreadIds.length > 0) {
      startTransition(async () => {
        await markNotificationsReadAction(unreadIds);
        setItems((prev) =>
          prev ? prev.map((r) => ({ ...r, read: true })) : prev,
        );
        setUnread(0);
      });
    }
  }

  async function markAllRead() {
    if (!items) return;
    const unreadIds = items.filter((r) => !r.read).map((r) => r.id);
    if (unreadIds.length === 0) return;
    await markNotificationsReadAction(unreadIds);
    setItems(items.map((r) => ({ ...r, read: true })));
    setUnread(0);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Известия"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--brand-magenta)] hover:bg-[color:var(--brand-pink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-magenta)]"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-11 z-50 w-[320px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_-10px_rgba(123,45,142,0.35)] ring-1 ring-[color:var(--brand-pink)]/40"
          >
            <div className="flex items-center justify-between border-b border-[color:var(--brand-pink)]/40 px-4 py-3">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-[color:var(--brand-ink)]">
                Известия
              </h3>
              {items && items.some((r) => !r.read) && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-medium text-[color:var(--brand-magenta)] hover:underline"
                >
                  Маркирай всички като прочетени
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {items === null ? (
                <p className="px-4 py-6 text-center text-sm text-[color:var(--brand-purple)]/60">
                  Зареждане…
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[color:var(--brand-purple)]/60">
                  Няма нови известия
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--brand-pink)]/30">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={`px-4 py-3 transition-colors ${
                        n.read ? "bg-white" : "bg-[color:var(--brand-pink-soft)]/60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span aria-hidden className="text-base leading-none">
                          🔔
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug text-[color:var(--brand-ink)]">
                            {n.message}
                          </p>
                          <p className="mt-1 text-[11px] text-[color:var(--brand-purple)]/55">
                            {relativeTime(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "току-що";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `преди ${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `преди ${h} ч`;
  const d = Math.floor(h / 24);
  if (d < 7) return `преди ${d} ${d === 1 ? "ден" : "дни"}`;
  return new Date(iso).toLocaleDateString("bg-BG");
}

function BellIcon({ className = "" }: { className?: string }) {
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
