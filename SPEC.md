# FitLab — Build Specification (v2)

> This is a **build spec**, not a wishlist. It is written to be handed to Claude Code
> and built incrementally. Every "OR" in the original prompt has been resolved into a
> single decision. Anything not in **MVP** is explicitly deferred so the agent does not
> try to build it now.

---

## 0. Confirmed decisions (locked by the owner)

| # | Decision | Chosen value | Notes |
|---|----------|--------------|-------|
| D1 | **Payment model** | **Deposit on every class.** Deposit is the *only* payment mechanism — **no passes/memberships in MVP.** | Owner's explicit choice, overriding the pass-based pattern seen in the Yoga Vibe export. Every booking = a deposit (online card or on-site). No-show burns it. **ASSUMPTION:** deposit is the sole mechanism (no parallel cards). If cards should coexist later, that's a Phase-2 add — flag now if wrong. |
| D2 | **Auth** | **SMS OTP (phone) is primary.** Magic-link email is the fallback. | Requires an SMS provider + sender number from day one (cost per message). Budget for it. |
| D3 | **Schedule views** | **Both Agenda (day list) AND Weekly grid in MVP.** | List view = the day-grouped agenda like the export. Weekly grid = 7-day calendar. Toggle between them. |

---

## 1. What we are building (one paragraph)

A **mobile-first** booking app for a premium yoga/fitness studio. Visitors browse the
public schedule with **no login**. Booking requires a quick **SMS OTP** login. Every
booking is secured by a **deposit** — paid online by card (Stripe) or left on-site
(`pending_deposit`). No-shows forfeit the deposit. Staff manage classes, schedules,
trainers, attendance and no-shows. The architecture is API-first so a React Native app
can reuse the same backend later.

---

## 2. Scope: MVP vs Later (most important section)

**Build only MVP first.** Do not start any "Later" item until MVP works end-to-end.

### MVP (Phase 1 — build now)
- Landing screen: logo + two buttons — **„Вход"** and **„Виж графика"**.
- Public schedule in **two views, toggleable**:
  - **Agenda** (grouped by day, like the export): time, duration, class name, trainer,
    category, studio, remaining spots.
  - **Weekly grid** (7-day calendar): same data laid out Mon–Sun.
- Auth: **SMS OTP primary**, magic-link email fallback. After login → redirect to schedule.
- Booking flow with **capacity enforcement** (no overbooking; „Класът е пълен" when full).
- **Deposit on every booking:** card via Stripe → `paid`, or on-site → `pending_deposit`.
- Booking statuses: `booked`, `pending_deposit`, `paid`, `attended`, `no_show`, `cancelled`.
- Staff: mark attendance / no-show after class. No-show burns deposit.
- Roles: `super_admin`, `admin`, `coach`, `member`.
- Configurable cancellation window (cancel ≥ X hours → deposit safe; late → forfeited).

### Later (Phase 2+) — do NOT build yet
Passes/memberships (if ever needed), waitlist + auto-fill, recurring-schedule generator,
SMS *reminders* (separate from OTP login), push notifications, realtime spot updates
(websocket), analytics dashboard, multi-location, native mobile app, PWA install.
**Architecture must not block these, but no code for them in MVP.**

---

## 3. Tech stack (decisions, not options)

- **Frontend & backend:** Next.js 16 (App Router) — API routes as the API layer.
  No separate NestJS for MVP.
- **Language:** TypeScript everywhere.
- **UI:** TailwindCSS + shadcn/ui. Framer Motion only for key transitions
  (landing → auth → schedule, and Agenda ⇄ Weekly toggle). Mobile-first; design at 380px first.
- **Forms/validation:** React Hook Form + Zod. Zod schemas **shared** between client and
  API routes (reusable by the future RN app).
- **Data fetching/state:** TanStack Query for server state; Zustand only for trivial UI
  state (e.g. which schedule view is active). Don't duplicate server data into Zustand.
- **ORM/DB:** Prisma + PostgreSQL.
- **Auth:** Supabase Auth with **phone/SMS OTP** as the primary method, email magic link
  as fallback. Sessions via JWT so tokens work for a future mobile client.
  **SMS provider:** Supabase phone auth needs an SMS gateway (e.g. Twilio/MessageBird) —
  configure one; this has per-message cost.
- **Payments:** Stripe (Checkout for the card deposit; webhook confirms `paid`).
- **Storage:** Supabase Storage (trainer photos).
- **Deploy:** Vercel (web) + Supabase (DB/auth/storage).

> Realtime / SMS-reminders / push providers are **not** chosen now. Leave clean seams (§7).

---

## 4. Data model (grounded in the real export)

- **Studio** — id, name, slug. (Export: studio_id 5 = "Yoga Vibe / San Stefano".)
  Multi-location is Phase 2, but keep `studioId` FK on classes now.
- **Practice / Category** — class *type* (Виняса Флоу, Пилатес, Хатха Йога, Ин Йога,
  Терапевтична йога, Тай Чи…). Export has `practice-id`. One Practice → many ScheduledClasses.
- **Trainer** — id, name, photo, bio, specialties (export has `trainer-id`). Some classes
  have **two** trainers ("Даниил & Юна") → support **many-to-many**.
- **ScheduledClass** (one occurrence) — start datetime, **duration minutes stored explicitly**
  (export varies: 45/55/70/80/90/100/120/240… — never assume 55), practiceId, studioId,
  capacity (**our addition — not in export**), depositAmount (per class; e.g. 600€ course),
  isSpecialEvent (bool), eventNotes (the `*`/`**`/`***` footnotes: room change,
  "карти не важат", deposit size).
- **Booking** — userId, scheduledClassId, status (the 6 statuses), createdAt, cancelledAt,
  paymentId (nullable), source (`card` | `onsite_deposit`).
  **Unique (userId, scheduledClassId)** to prevent duplicates.
- **Payment** — Stripe ids, amount, currency, status. Every paid booking has one.
- **User / Role** — role enum; a user may also be a Trainer (link). User has verified phone.
- **(Phase 2 stubs, table-ready but unused):** Membership/Pass, Waitlist, Notification,
  RecurringRule.

> **Capacity & remaining spots:** export has no visible capacity, so *we* add `capacity`
> per ScheduledClass and compute `remainingSpots = capacity − count(active bookings)`.
> Active = (booked, pending_deposit, paid, attended). Cancelled/no_show free a spot.

---

## 5. Booking engine — the part most likely to break

In priority order:

1. **No overbooking, ever.** Remaining-spots check + booking insert must be **atomic**:
   one DB transaction with row-level locking (`SELECT … FOR UPDATE` on the class row, or a
   conditional insert that fails when full). Never read-count-then-insert in two steps.
2. **No duplicate bookings.** Use the unique `(userId, scheduledClassId)` constraint;
   show "вече си записан" on violation.
3. **Every booking requires a deposit** (D1). On „Избор":
   - Card → Stripe Checkout → webhook → `paid`.
   - On-site → status `pending_deposit`.
   - Spot is held in both cases (counts as active).
4. **Cancellation policy:** studio config `cancelWindowHours`. Before (start − window) →
   cancel cleanly, free spot, deposit returned/not charged. After → `cancelled` + deposit forfeited.
5. **Attendance:** staff sets `attended` or `no_show`. `no_show` → deposit burned.

Write the engine as **pure, tested functions** (input → result), separate from API routes,
so the future mobile app and cron jobs reuse it. Unit-test: full class, duplicate,
concurrent bookings, cancel-in-window, cancel-late, no-show burn.

---

## 6. Screens (mobile-first)

1. **Landing** — logo, „Вход", „Виж графика". Minimal, premium, fast.
2. **Schedule (public)** — **toggle Agenda ⇄ Weekly**.
   - Agenda: grouped by day like the export (понеделник / 25.05.2026 → rows).
     Row: `08:00 /55 min/`, class name, trainer, category tag, remaining spots, „Избор".
   - Weekly: 7-day grid, same rows placed by day/time. Special events visually marked.
3. **Auth** — phone field → SMS OTP code → back to schedule. Email magic link as fallback link.
   < 30s, no password.
4. **Booking sheet** — opens on „Избор". Class detail → "Как искаш да оставиш депозит?"
   → Карта (Stripe) / На място.
5. **My bookings / Profile** — upcoming, past, attendance stats, deposit/payment history.
6. **Staff** — class list → participants → mark attended/no_show. Admin: CRUD classes,
   trainers, capacities, deposit amounts; view bookings/payments.

---

## 7. Future-proofing seams (cheap now, no real code)

- All business logic in `/lib` pure functions; API routes are thin wrappers.
- Shared Zod schemas in a `/packages/shared`-style folder so RN can import them.
- A single `notify(event)` interface with a no-op implementation now; SMS-reminders/push
  plug in later without touching callers. (OTP login is separate and built now.)
- A `getRemainingSpots()` that today queries the DB; a realtime layer can later push the
  same value. No websockets now.
- Keep a `Membership` table stub so adding passes later doesn't require a painful migration.

---

## 8. Security (MVP-level, real)

- Server-side role checks on every staff/admin route (never trust the client).
- Zod validation on every API input.
- Stripe webhook signature verification; never trust client-reported payment success.
- Rate-limit OTP requests (per phone + per IP) and booking endpoints. OTP brute-force guard.
- Store only what's needed (GDPR-minded); add a delete-account path.

---

## 9. Build roadmap for Claude Code (in order, commit after each)

1. **Scaffold:** Next.js 16 + TS + Tailwind + shadcn; Prisma → Postgres.
2. **Schema:** implement §4 in `schema.prisma`; migrate; seed ~3 days of the real export
   (real trainers, practices, varied durations) for realistic testing.
3. **Public schedule:** Agenda view first, then Weekly grid; read-only, no auth.
4. **Auth:** SMS OTP (phone) primary + email magic-link fallback; route guard; redirect.
5. **Booking engine (`/lib`) + tests:** §5 as pure functions, fully tested, before any UI.
6. **Booking UI:** „Избор" sheet → deposit path; capacity + duplicate handling live.
7. **Stripe card deposit:** Checkout + webhook → `paid`; on-site → `pending_deposit`.
8. **Staff attendance:** mark attended/no_show; deposit-burn rule.
9. **Profile:** my bookings + deposit history.
10. **Polish:** Framer transitions, view toggle animation, empty/full states, „Класът е пълен".

> After step 10, MVP is done. Only then open the Phase-2 list, one feature at a time.

---

## 10. Definition of done for MVP

A visitor opens the app, sees the real-looking schedule in **both Agenda and Weekly** views,
taps „Избор", logs in by **SMS code** in one step, leaves a **deposit** (card or on-site),
gets blocked when the class is full, can cancel within the window (deposit safe) or late
(deposit forfeited); staff marks attendance; a **no-show burns the deposit**. All
booking-engine paths have passing tests.
