"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookingSource,
  BookingStatus,
  Role,
} from "@/lib/generated/prisma/enums";
import {
  formatEurMinor,
  formatSofiaDay,
  formatSofiaTime,
} from "@/lib/format";
import {
  adminCancelBookingAction,
  updateClientAction,
} from "../../_actions";

type UserView = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  depositBalance: number;
  createdAt: string;
};

type BookingView = {
  id: string;
  status: BookingStatus;
  source: BookingSource;
  depositAmount: number;
  startAt: string;
  durationMinutes: number;
  practiceName: string;
  studioName: string;
  trainers: string[];
};

type Stats = {
  attended: number;
  noShows: number;
  cancelledByUser: number;
  totalSpendMinor: number;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: "Записан",
  pending_deposit: "Чека плащане",
  paid: "Платено",
  attended: "Посетил/а",
  no_show: "Не дойде",
  cancelled: "Отменено",
};

const STATUS_COLOR: Record<BookingStatus, string> = {
  booked: "bg-green-50 text-green-700 border-green-200",
  pending_deposit: "bg-amber-50 text-amber-700 border-amber-300",
  paid: "bg-green-50 text-green-700 border-green-200",
  attended: "bg-blue-50 text-blue-700 border-blue-200",
  no_show: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};

const SOURCE_LABEL: Record<BookingSource, string> = {
  card: "Карта",
  onsite_deposit: "На място",
  balance: "Баланс",
};

const CANCELABLE_STATUSES: BookingStatus[] = [
  BookingStatus.booked,
  BookingStatus.pending_deposit,
  BookingStatus.paid,
];

export function ClientDetail({
  user,
  callerIsSelf,
  callerIsSuperAdmin,
  stats,
  bookings,
}: {
  user: UserView;
  callerIsSelf: boolean;
  callerIsSuperAdmin: boolean;
  stats: Stats;
  bookings: BookingView[];
}) {
  return (
    <div className="space-y-6">
      <ProfileForm
        user={user}
        callerIsSelf={callerIsSelf}
        callerIsSuperAdmin={callerIsSuperAdmin}
      />
      <StatsBar user={user} stats={stats} />
      <BookingHistory bookings={bookings} />
    </div>
  );
}

function ProfileForm({
  user,
  callerIsSelf,
  callerIsSuperAdmin,
}: {
  user: UserView;
  callerIsSelf: boolean;
  callerIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<Role>(user.role);
  const [balanceEur, setBalanceEur] = useState(
    (user.depositBalance / 100).toFixed(2),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSave() {
    setMsg(null);
    const cents = Math.round(parseFloat(balanceEur || "0") * 100);
    if (Number.isNaN(cents) || cents < 0) {
      setMsg({ ok: false, text: "Невалиден баланс." });
      return;
    }
    startTransition(async () => {
      const r = await updateClientAction({
        userId: user.id,
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        role,
        depositBalance: cents,
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <h2 className="mb-4 font-display text-lg font-bold tracking-tight">
        Профил
      </h2>

      <div className="space-y-3">
        <Field label="Име">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
          />
        </Field>

        <Field label="Имейл (само за четене)">
          <input
            type="email"
            value={user.email ?? ""}
            readOnly
            disabled
            className="w-full rounded-xl border border-[color:var(--brand-pink)]/20 bg-gray-50 px-3 py-2 text-sm text-[color:var(--brand-purple)]/60"
          />
        </Field>

        <Field label="Телефон">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
          />
        </Field>

        <Field label="Роля">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={callerIsSelf}
            className="w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none disabled:bg-gray-50 disabled:text-[color:var(--brand-purple)]/60"
          >
            <option value={Role.member}>Член</option>
            <option value={Role.coach}>Coach</option>
            <option value={Role.admin}>Admin</option>
            <option value={Role.super_admin} disabled={!callerIsSuperAdmin}>
              Super admin
            </option>
          </select>
          {callerIsSelf && (
            <p className="mt-1 text-[11px] text-[color:var(--brand-purple)]/60">
              Не може да променяш собствената си роля.
            </p>
          )}
        </Field>

        <Field label="Баланс (EUR)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={balanceEur}
            onChange={(e) => setBalanceEur(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--brand-pink)]/40 bg-white px-3 py-2 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
          />
        </Field>
      </div>

      {msg && (
        <p
          role="alert"
          className={`mt-3 rounded-xl px-3 py-2 text-[12px] ${msg.ok ? "bg-green-50 text-green-700" : "bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-magenta)]"}`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="mt-4 w-full rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3 font-display font-semibold text-white shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)] transition-all hover:bg-[color:var(--brand-purple)] disabled:opacity-60"
      >
        {pending ? "Записва…" : "Запази промените"}
      </button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/70">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatsBar({ user, stats }: { user: UserView; stats: Stats }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <Stat label="Посетени" value={String(stats.attended)} />
      <Stat label="Не дойде" value={String(stats.noShows)} />
      <Stat label="Отменени" value={String(stats.cancelledByUser)} />
      <Stat label="Общо платено" value={formatEurMinor(stats.totalSpendMinor)} />
      <div className="col-span-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
        <p className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
          Текущ баланс
        </p>
        <p
          className={`mt-1 font-display text-2xl font-bold ${user.depositBalance > 0 ? "text-[color:var(--brand-magenta)]" : "text-[color:var(--brand-purple)]/50"}`}
        >
          {formatEurMinor(user.depositBalance)}
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-[color:var(--brand-purple)]">
        {value}
      </p>
    </div>
  );
}

function BookingHistory({ bookings }: { bookings: BookingView[] }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold tracking-tight">
        Записвания ({bookings.length})
      </h2>
      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--brand-pink)] bg-white px-5 py-8 text-center">
          <p className="text-sm text-[color:var(--brand-purple)]/70">
            Този клиент няма записвания.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {bookings.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingRow({ booking }: { booking: BookingView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [override, setOverride] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const startDate = new Date(booking.startAt);
  const canCancel = CANCELABLE_STATUSES.includes(booking.status);

  function handleCancel() {
    if (!confirm("Сигурен/а ли си, че искаш да анулираш това записване?")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await adminCancelBookingAction({
        bookingId: booking.id,
        overrideRefund: override,
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(123,45,142,0.05),0_4px_16px_-8px_rgba(236,72,153,0.18)]">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-[color:var(--brand-ink)]">
            {booking.practiceName}
          </p>
          <p className="text-[11px] text-[color:var(--brand-purple)]/60">
            {booking.studioName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_COLOR[booking.status]}`}
        >
          {STATUS_LABEL[booking.status]}
        </span>
      </div>

      <p className="text-[12px] text-[color:var(--brand-purple)]/70">
        {formatSofiaDay(startDate)} · {formatSofiaTime(startDate)} ·{" "}
        {booking.durationMinutes} мин
      </p>
      {booking.trainers.length > 0 && (
        <p className="text-[12px] text-[color:var(--brand-purple)]/70">
          {booking.trainers.join(" & ")}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-[color:var(--brand-purple)]/60">
          {SOURCE_LABEL[booking.source]} · {formatEurMinor(booking.depositAmount)}
        </span>
      </div>

      {canCancel && (
        <div className="mt-3 border-t border-[color:var(--brand-pink)]/30 pt-3">
          <label className="mb-2 flex items-center gap-2 text-[11px] text-[color:var(--brand-purple)]/70">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override — върни депозита независимо от прозореца
          </label>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="w-full rounded-xl border-2 border-[color:var(--brand-magenta)] bg-white px-4 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-magenta)] hover:text-white disabled:opacity-60"
          >
            {pending ? "…" : "Анулирай"}
          </button>
        </div>
      )}

      {msg && (
        <p
          role="alert"
          className={`mt-2 rounded-xl px-3 py-2 text-[11px] ${msg.ok ? "bg-green-50 text-green-700" : "bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-magenta)]"}`}
        >
          {msg.text}
        </p>
      )}
    </li>
  );
}
