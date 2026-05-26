@AGENTS.md

# FitLab — Project Memory

Mobile-first booking app for a premium yoga/fitness studio. API-first so a future RN app reuses the backend. **Build MVP only — do not start Phase 2 work.** Full spec in [SPEC.md](SPEC.md).

## Tech stack (§3)

- **Next.js 16 (App Router)** — frontend + API routes (no separate backend).
- **TypeScript** everywhere.
- **TailwindCSS + shadcn/ui**. Framer Motion only for key transitions. Mobile-first, design at 380px first.
- **React Hook Form + Zod**; Zod schemas **shared** between client and API (reusable by future RN app).
- **TanStack Query** for server state; **Zustand** only for trivial UI state — never duplicate server data.
- **Prisma + PostgreSQL**.
- **Supabase Auth** — phone/SMS OTP primary, email magic link fallback. JWT sessions. Requires an SMS gateway (Twilio/MessageBird) — per-message cost.
- **Stripe** — Checkout for card deposit; webhook confirms `paid`.
- **Supabase Storage** — trainer photos.
- **Deploy:** Vercel (web) + Supabase (DB/auth/storage).

## Data model (§4)

- **Studio** — id, name, slug. Keep `studioId` FK on classes now (multi-location is Phase 2).
- **Practice/Category** — class type (Виняса Флоу, Пилатес, Хатха, Ин, Терапевтична, Тай Чи…). One→many ScheduledClasses.
- **Trainer** — id, name, photo, bio, specialties. **Many-to-many** with classes (some classes have two trainers).
- **ScheduledClass** — start datetime, **duration minutes stored explicitly** (varies 45–240, never assume), practiceId, studioId, **capacity** (our addition, not in export), depositAmount, isSpecialEvent, eventNotes.
- **Booking** — userId, scheduledClassId, status, createdAt, cancelledAt, paymentId (nullable), source (`card` | `onsite_deposit`). **Unique (userId, scheduledClassId)**.
- **Payment** — Stripe ids, amount, currency, status. Every paid booking has one.
- **User/Role** — enum `super_admin | admin | coach | member`. User may also link to a Trainer. Verified phone.
- **Phase 2 stubs (table-ready, unused):** Membership/Pass, Waitlist, Notification, RecurringRule.

**Booking statuses:** `booked`, `pending_deposit`, `paid`, `attended`, `no_show`, `cancelled`.
**Active (counts against capacity):** `booked`, `pending_deposit`, `paid`, `attended`. `cancelled`/`no_show` free the spot.
**Remaining spots:** `capacity − count(active bookings)`, computed.

**Prisma client** is generated in `lib/generated/prisma` (not `node_modules`). Import from `@/lib/generated/prisma`.

**Prisma 7 client requires a Driver Adapter** — no URL-string constructor. Instantiate via `@prisma/adapter-pg`:
```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```
Runtime app code uses `DATABASE_URL` (Supabase pooler, port 6543). Migrations and the seed use `DIRECT_URL` (direct, port 5432) — wired via `prisma.config.ts`.

## Booking engine rules (§5)

Pure tested functions in `/lib`, separate from API routes (reusable by RN + cron). Test: full class, duplicate, concurrent, cancel-in-window, cancel-late, no-show burn.

1. **No overbooking.** Capacity check + insert must be **atomic** — one DB transaction with row-level lock (`SELECT … FOR UPDATE`) or conditional insert. Never read-count-then-insert.
2. **No duplicates** — rely on unique `(userId, scheduledClassId)`; show "вече си записан" on violation.
3. **Deposit required on every booking** (D1 — sole payment mechanism, no passes in MVP):
   - Card → Stripe Checkout → webhook → `paid`.
   - On-site → `pending_deposit`.
   - Spot held in both cases.
4. **Cancellation:** studio config `cancelWindowHours`. Before (start − window) → cancel clean, deposit safe. After → `cancelled` + deposit forfeited.
5. **Attendance:** staff sets `attended` or `no_show`. `no_show` burns deposit.

## Roadmap (§9) — commit after each step

1. Scaffold: Next.js 16 + TS + Tailwind + shadcn; Prisma → Postgres.
2. Schema: §4 in `schema.prisma`; migrate; seed ~3 days of real export.
3. Public schedule: Agenda first, then Weekly grid; read-only, no auth.
4. Auth: SMS OTP primary + email magic-link fallback; route guard; redirect.
5. **Booking engine (`/lib`) + tests** — pure functions, fully tested, *before any booking UI*.
6. Booking UI: „Избор" sheet → deposit path; capacity + duplicate handling live.
7. Stripe card deposit: Checkout + webhook → `paid`; on-site → `pending_deposit`.
8. Staff attendance: attended/no_show + deposit-burn.
9. Profile: my bookings + deposit history.
10. Polish: Framer transitions, view toggle, empty/full states, „Класът е пълен".

After step 10, MVP done. Only then consider Phase 2.

## Booking flow reference (steps 4–6)

Design intent for the „Избор" tap → confirmation flow. Do **not** build any of this until we reach those roadmap steps; this note exists so the visual reference isn't lost.

- Tapping „Избор" opens a **„Запазване на място"** modal/sheet.
- The modal shows class details: **studio, practice, date, time, duration**. (Trainer name optional; reuse what the card already shows.)
- A **payment-method selector** with two options (D1):
  1. **Плати депозит с карта сега** → Stripe Checkout → webhook → `paid`.
  2. **Плати на място — до деня преди класа** → `pending_deposit`.
- Visible **cancellation rules** under the choice: cancel ≥ studio.`cancelWindowHours` (default 24h) → deposit safe; later → forfeited; **no-show forfeits deposit**.
- Primary action: **Потвърди**. Spot is held the moment the booking row is created (see SPEC §5 atomicity + unique-key rules).

**Auth is SMS OTP, no passwords (D2).** The reference system we're looking at has password fields and an all-at-once registration step — **do not copy that**. Our model is:

- Not logged in → tap „Избор" → SMS OTP screen → on success, the same „Запазване на място" modal opens with the user already authenticated.
- Logged in → modal shows class details + deposit choice + Потвърди. **No password input. No email-and-password form. No combined "register + book" screen.**

Phone (E.164) is the only login identifier; email is a magic-link fallback configured later, never collected in the booking modal.

## Hard rules

- Do not build Phase 2 features (passes/memberships, waitlist, recurring generator, SMS reminders, push, websockets, analytics, multi-location, native app, PWA). Leave seams, no code.
- Business logic in `/lib` pure functions; API routes are thin wrappers.
- Server-side role checks on every staff/admin route. Zod validation on every input. Stripe webhook signature verified. Rate-limit OTP + booking endpoints.
