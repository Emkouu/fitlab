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
- **Fibank ECOMM (виртуален ПОС)** — the card provider for the one-off deposit. See „Card payments" below. Stripe has been removed entirely.
- **Supabase Storage** — trainer photos.
- **Deploy:** Vercel (web) + Supabase (DB/auth/storage). Migration to a Hetzner box behind HestiaCP is planned so the Fibank virtual POS gets a static outbound IP — runbook in `fitlab-hetzner-migration.md`. Supabase (DB/auth/storage) stays either way.

## Data model (§4)

- **Studio** — id, name, slug. Keep `studioId` FK on classes now (multi-location is Phase 2).
- **Practice/Category** — class type (Виняса Флоу, Пилатес, Хатха, Ин, Терапевтична, Тай Чи…). One→many ScheduledClasses.
- **Trainer** — id, name, photo, bio, specialties. **Many-to-many** with classes (some classes have two trainers).
- **ScheduledClass** — start datetime, **duration minutes stored explicitly** (varies 45–240, never assume), practiceId, studioId, **capacity** (our addition, not in export), depositAmount, isSpecialEvent, eventNotes.
- **Booking** — userId, scheduledClassId, status, createdAt, cancelledAt, paymentId (nullable), source (`card` | `onsite_deposit` | `balance`). **Partial unique index** on `(userId, scheduledClassId)` WHERE `status != 'cancelled'` — lets a user re-book a class after cancelling it.
- **Payment** — ECOMM transaction fields (`ecommTransId`, result, RRN, card mask, refund), amount, currency (`EUR`), status. The `stripe*` columns remain only for rows from the removed Stripe integration. Every paid booking has one.
- **User/Role** — enum `super_admin | admin | coach | member`. User may also link to a Trainer. Verified phone. Carries `depositBalance Int @default(0)` (minor units / EUR cents) accumulated from refunded cancellations.
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
2. **No duplicates** — rely on the partial unique index on `(userId, scheduledClassId)` WHERE `status != 'cancelled'`; show "вече си записан" on violation. The partial predicate lets a user re-book the same class after cancelling.
3. **Deposit is a ONE-OFF standing guarantee, not a per-booking fee** (`lib/deposit.ts`). €10 paid once at the studio, recorded by an admin on `User.depositBalance`; it is what makes online reserving possible and **stays** on the profile. Booking requires `depositBalance ≥ DEPOSIT_UNIT_MINOR` but **never debits it**. Source → initial status:
   - `card`    → `booked` → Fibank ECOMM (`/pay/<id>` → bank) → the return leg flips to `paid`.
   - `balance` → `booked` (instant; the standing deposit backs it, no debit).
   - `onsite_deposit` → `pending_deposit` (paid in cash on arrival).
   - Spot is held in all three cases.
   - The **class fee** is a separate thing, always settled on site. The client picks an intended method in the booking modal (`subscription | cash | multisport`, see `lib/payments/classFeeMethods.ts`), persisted on `Booking.onsiteMethod`; staff confirm or correct it in Attendance.
4. **JIT abandoned-checkout sweep.** `createBooking` opportunistically cancels stale card holds on the same class inside the row-locked transaction: `source=card` AND `status=booked` AND no paid `Payment` AND `createdAt < now − 15min`. On-site and balance bookings are never swept.
5. **Cancellation:** studio config `cancelWindowHours` (default **4** in MVP). Before (start − window) → cancel clean, **deposit stays** (nothing to refund — it was never debited). After → `cancelled` + **burn one deposit** (`card`/`balance` only; `onsite_deposit` never touches `depositBalance`). Admin can pass `overrideRefund` to skip the burn.
6. **Attendance:** staff sets `attended` (with the class-fee method) or `no_show`.
   - `attended` → deposit **untouched**, stays for the next booking.
   - `no_show`  → burn one deposit, once (guarded on `previousStatus`).
   - Correcting a `no_show` back to `attended` **restores** the deposit, so a mis-tap never costs the client €10.
   - The engine only returns verdicts + `previousStatus`; the money moves in `app/admin/attendance/_actions.ts`.

## Roadmap (§9) — commit after each step

1. Scaffold: Next.js 16 + TS + Tailwind + shadcn; Prisma → Postgres.
2. Schema: §4 in `schema.prisma`; migrate; seed ~3 days of real export.
3. Public schedule: Agenda first, then Weekly grid; read-only, no auth.
4. Auth: SMS OTP primary + email magic-link fallback; route guard; redirect.
5. **Booking engine (`/lib`) + tests** — pure functions, fully tested, *before any booking UI*.
6. Booking UI: „Избор" sheet → deposit path; capacity + duplicate handling live.
7. Card deposit through the Fibank virtual POS → `paid`; on-site → `pending_deposit`.
8. Staff attendance: attended/no_show + deposit-burn.
9. Profile: my bookings + deposit history.
10. Polish: Framer transitions, view toggle, empty/full states, „Класът е пълен".

After step 10, MVP done. Only then consider Phase 2.

## Legal identity + policies

- The trader and GDPR controller is **ФИЗИОЛАЙФ 22 ЕООД (ЕИК 207009324)**; „FitLab Varna" is only a trade name. All of it lives in `lib/legal/company.ts` (`COMPANY`, `ACQUIRER`, `PROCESSORS`, `DPA`, `CPC`, `POLICIES_LAST_UPDATED`) — never hardcode the company anywhere else. Bump `POLICIES_LAST_UPDATED` on every policy edit.
- `/policies` renders five anchored sections: Търговец, Поверителност (GDPR Art. 13 disclosure set), Плащания и депозити (virtual POS), Общи условия, Бисквитки. Studio-specific numbers (address, phone, `cancelWindowHours`) come from the DB; the deposit amount from `DEPOSIT_UNIT_MINOR`.
- Online card deposits go through the **виртуален ПОС на Първа инвестиционна банка АД (Fibank)** — card data never touches our servers.
- Trader identity must stay permanently accessible: landing-page footer line + electronic receipt („Търговец" row in `emails/BookingConfirmation.tsx`).
- `/policies` sections were rewritten for the acquirer's 07.08.2026 letter — see `fitlab-fibank-integration.md` for the requirement→location map. Anything the bank is told must stay true in the code.

## Class price

`Studio.defaultClassPrice` (€10) with an optional `Practice.priceMinor` override, resolved **only** through `classPriceMinor()` in `lib/pricing.ts`. Never read either column directly. The acquirer requires the final price of the service to be visible at every step that leads to a transaction, so it appears on the schedule card, in the booking modal, on `/pay`, on the receipt and in `/policies#prices`. Editable in Админ → Настройки and Админ → Практики.

## Card payments — Fibank ECOMM

- Client: `lib/payments/ecomm/` — `protocol.ts` (pure, tested: response parsing, EUR=978, amount formatting, BG→latin transliteration of `description`, IPv4 normalisation), `client.ts` (mutual-TLS POST via `node:https` + the four commands), `config.ts` (endpoints + PKCS#12 keystore from env; never throws at import).
- Flow: `bookClassAction(source: "card")` → `startEcommPaymentForBooking` registers `command=v` and stores `Payment.ecommTransId` → the client is sent to `/pay/<bookingId>`, which **POSTs** `trans_id` to ClientHandler (a POST is mandatory) → the bank returns the client to `/api/payments/ecomm/return` or `/fail` → `settleEcommPaymentForBooking` asks `command=c` and writes the result.
- **`RESULT` is the only field that decides success** (manual §4.2); `RESULT_CODE` and `3DSECURE` are informational. Every returned field is preserved on `Payment.ecomm*`.
- The return URLs are registered with the bank verbatim and **must never carry query parameters**. The booking is identified by the `ecomm_booking` cookie (`SameSite=None; Secure`, since the bank POSTs cross-site) with the `booking_id` form field as fallback.
- The card charge is **`DEPOSIT_UNIT_MINOR`** (€10), never `ScheduledClass.depositAmount` — that column is an admin field the client is never shown.
- Refunds go back **only** to the same card (`lib/payments/refundCardPayment.ts`, `command=k`). Payments with no `ecommTransId` (rows left from the removed Stripe integration) are reported as `unsupported` rather than silently marked refunded.
- **Stripe is gone** — `lib/stripe.ts`, `createCheckoutForBooking.ts`, `/api/stripe/webhook` and the `stripe` dependency were deleted. Its `Payment.stripe*` columns stay for historical rows. Never reintroduce a module that throws at import over a missing key: that is what broke the production build.
- The **test** gateway (`mdpay-test.fibank.bg`) serves a certificate whose SANs cover only the bank's internal names, so `client.ts` relaxes the *hostname* check for `ECOMM_ENVIRONMENT=test` via `isFibankTestCertificate()` — chain verification stays on, `rejectUnauthorized` is never disabled, and production gets no exemption.
- **`language=default`** on `command=v`, per the acquirer's explicit instruction — not a locale like `bg`. The page's Bulgarian wording comes from the template we submitted (`fibank/cardinfo_bg.mustache.html`), not from this parameter.
- Env: `ECOMM_ENVIRONMENT`, `ECOMM_CERT_PFX_BASE64`, `ECOMM_CERT_PASSWORD`, optional `ECOMM_MERCHANT_URL` / `ECOMM_CLIENT_URL`. Test merchant ID `000001512278900`; the keystore is base64 in env, never a file in the repo (`*.pkcs12` is gitignored).
- ⚠️ Vercel has no static outbound IP; if the bank requires an IP whitelist the calls need a fixed-IP proxy. Open decision — see `fitlab-fibank-integration.md` §B1.

## Terms consent

`bookClassAction` refuses any booking without `acceptTerms === true` (all sources, not just `card`) and stamps `Booking.termsAcceptedAt` + `termsVersion` (= `POLICIES_LAST_UPDATED`) inside the engine's transaction. The checkbox in the booking modal is never pre-ticked, and it gates the button that leads to the bank's card-data page.

## Public schedule visibility window

Staff schedule a whole month ahead; **clients only see a rolling 7 days — today + the next 6 Sofia days**. Each weekday appears exactly once in the window, so nobody can look at „събота", book, and land on *next* week's Saturday.

- Single source of truth: `lib/schedule/publicWindow.ts` (`PUBLIC_WINDOW_DAYS`, `publicWindowEndKey`, `publicWindowEndExclusive`, `isWithinPublicWindow`) + tests.
- Applied to `/schedule` only: the agenda query, `getClassesForMonth` (days outside the window come back empty), and the Месец grid (out-of-window days inert/no dots, next-month arrow disabled).
- `/admin/**` is **not** windowed — staff keep the full month.
- **Special events are exempt.** `/events` lists them however far out they are, and `?openBooking=<id>` resolves server-side (`loadDeepLinkRow` in `app/schedule/page.tsx`) so an out-of-window event still opens its booking modal. Regular classes can only be deep-linked inside the window.

## Booking flow reference (steps 4–6)

Design intent for the „Избор" tap → confirmation flow. Do **not** build any of this until we reach those roadmap steps; this note exists so the visual reference isn't lost.

- Tapping „Избор" opens a **„Запазване на място"** modal/sheet.
- The modal shows class details: **studio, practice, date, time, duration**. (Trainer name optional; reuse what the card already shows.)
- **No deposit on the profile** → the modal explains the one-off deposit („Депозитът в размер на 10,00 € се заплаща еднократно…") + „плати депозит в студиото" nudge, and Потвърди stays disabled.
- **Deposit already on the profile** → **no deposit copy at all**; instead „Избери как ще заплатиш тренировката" (Абонаментна карта / В брой / Multisport), required before Потвърди enables.
- Visible **cancellation rules** under the choice: отписване ≥ studio.`cancelWindowHours` (default **4h** in MVP) → депозитът остава; later → усвоява се; **неявяване усвоява депозита**.
- Primary action: **Потвърди**. Spot is held the moment the booking row is created (see SPEC §5 atomicity + unique-key rules).

**Auth is SMS OTP, no passwords (D2).** The reference system we're looking at has password fields and an all-at-once registration step — **do not copy that**. Our model is:

- Not logged in → tap „Избор" → SMS OTP screen → on success, the same „Запазване на място" modal opens with the user already authenticated.
- Logged in → modal shows class details + deposit choice + Потвърди. **No password input. No email-and-password form. No combined "register + book" screen.**

Phone (E.164) is the only login identifier; email is a magic-link fallback configured later, never collected in the booking modal.

### Verdict vs money action (steps 7–8)

The booking engine in `lib/booking/` returns booleans — `depositForfeited` from `cancelBooking`, `depositBurned` + `previousStatus` from `markAttendance` — **without touching money**. They are *verdicts*, not actions.

Because the deposit is never debited at booking time, the only money action is the **burn** (and its undo):

| `source`           | verdict = false (timely cancel / attended) | verdict = true (late cancel / no-show) |
|--------------------|--------------------------------------------|----------------------------------------|
| `card`             | nothing — deposit stays on the profile     | decrement `User.depositBalance` by one unit |
| `balance`          | nothing — deposit stays on the profile     | decrement `User.depositBalance` by one unit |
| `onsite_deposit`   | nothing (no recorded deposit)              | nothing (no recorded deposit)*         |

\* For on-site bookings no deposit was ever recorded, so "forfeit" is a non-event for us. Studio staff handles cash in the room; the engine's job is just to set the status correctly so reports stay consistent.

Burns are **idempotent by construction**: `markAttendanceAction` burns only when `previousStatus !== no_show`, restores when a `no_show` is corrected to `attended`, and always clamps at 0 via a conditional `updateMany`. A studio-side class cancellation never burns anything.

Implication: the refund logic lives in `lib/payments/refundCardPayment.ts` and gates on `source === "card"` before doing anything. The engine never talks to the bank.

## Phase 2 — admin routes

- All admin tooling lives under `/admin/**` and is gated by `getAdminUser()` (role ∈ `{admin, super_admin}`); destructive operations (cancel class, refund all, delete trainer, super-admin role grants, edit studio config) require **`super_admin`** only. Admin pages re-check the role server-side on every request — never trust the client, never trust middleware alone.
- Admin server actions live in `app/admin/_actions.ts` and must (a) call `getAdminUser()` first, (b) validate input with a Zod schema from `lib/validation/`, (c) keep network I/O (card refunds to the bank) **outside** Prisma `$transaction` blocks.
- `/admin` is in `PROTECTED_PREFIXES` in `lib/supabase/middleware.ts` so anonymous visitors are bounced to `/login` before any Prisma query runs.
- **Attendance lives at `/admin/attendance`** (Phase 2b — Step 15). The old `/staff` routes are removed; the proxy/middleware redirects `/staff*` → `/admin/attendance*` for any saved bookmarks.
- **Coach panel.** The `coach` role gets a REDUCED `/admin` panel via `getStaffUser()` (`lib/auth/getStaffUser.ts`, role ∈ {admin, super_admin, coach}): schedule **view-only** (`readOnly` prop hides edit/cancel/delete), attendance marking (page + `markAttendanceAction` are staff-gated), and client list + **add client** (`/admin/clients/new`, `addClientAction`). Everything else — class CRUD, client detail editing, settings, partners, stats — stays behind `getAdminUser()`. Coach dashboard shows no financial KPIs.
- **Client management lives at `/admin/clients`** (Phase 2b — Step 16). The list page shows every user (with role + balance + bookings count). The detail page `/admin/clients/[userId]` lets admin edit profile fields (name, phone, role, balance), see stats, and cancel any active booking via `adminCancelBookingAction` (with optional `overrideRefund` to bypass the cancel window). Safety rules baked in: admin cannot change own role; only super_admin can grant super_admin; email is read-only (Supabase identifier); balance is bounded ≥ 0; all edits logged via `console.log("[admin-audit] …")`.

## Email reminders

- Class-reminder emails go through **Resend** + `@react-email/components`. Template lives at `emails/ClassReminder.tsx`; send helper at `lib/email/sendReminder.ts`. Env: `RESEND_API_KEY`, optional `RESEND_FROM`.
- **Vercel Cron** runs `/api/cron/reminders` every **15 minutes** (configured in `vercel.json`). The route is guarded by `Authorization: Bearer ${CRON_SECRET}`.
- Two reminders per booking: **24h** and **2h** before `scheduledClass.startAt`, with a ±15min window so each booking is caught once per mark. Idempotency: `Booking.reminder24hSentAt` / `Booking.reminder2hSentAt` (set only after a successful send).
- Reminders are only sent for active bookings (`booked | pending_deposit | paid`) on classes that aren't `cancelledAt`. The send helper re-checks status before hitting Resend.

## Hard rules

- Do not build Phase 2 features (passes/memberships, waitlist, recurring generator, SMS reminders, push, websockets, analytics, multi-location, native app, PWA). Leave seams, no code.
- Business logic in `/lib` pure functions; API routes are thin wrappers.
- Server-side role checks on every staff/admin route. Zod validation on every input. Card results are read from the bank (`command=c`), never trusted from the client. Rate-limit OTP + booking endpoints.
