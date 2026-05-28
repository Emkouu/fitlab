# FitLab Codebase Audit — Full Review Prompt

## Context
This project has been built across multiple AI agent sessions (Claude Code + GitHub Copilot). Each session made incremental changes. Before continuing with Phase 2 (Admin Panel), we need a full codebase audit to catch inconsistencies, dead code, broken assumptions, and anything that will cause problems later.

**Do NOT build any new features during this audit. Read, analyze, and report only. Fix only what is explicitly listed as "fix immediately" below.**

---

## What to Audit

### 1. Architecture & File Structure
- Read `CLAUDE.md` and `SPEC.md` first. Understand the intended architecture.
- Check that the actual file/folder structure matches the intended architecture.
- Look for files that shouldn't exist, duplicate logic, or misplaced code.
- Check that `/staff` (attendance) and any admin routes are cleanly separated.
- Report any routes, components, or lib files that seem orphaned or unused.

### 2. Database & Schema
- Read `prisma/schema.prisma` in full.
- Verify all models match the original SPEC §4:
  - `ScheduledClass.durationMinutes` is `Int` with no default (never assume 55).
  - `Booking` has `@@unique([userId, scheduledClassId])` — check if this is now a partial index (after the cancelled-bookings fix) and verify it's correct.
  - `BookingStatus` enum has exactly 6 values: `booked`, `pending_deposit`, `paid`, `attended`, `no_show`, `cancelled`.
  - `BookingSource` enum — check what values exist. Should be: `card`, `onsite_deposit`, `balance` (balance was added in a later session).
  - `User` has `depositBalance Int @default(0)` (added in session 2).
  - `Studio` has `cancelWindowHours Int @default(4)` (changed from 24 to 4).
  - `Membership`, `Waitlist`, `Notification`, `RecurringRule` are still empty stubs.
  - `ScheduledClass` has `cancelledAt DateTime?` (needed for Phase 2; check if it exists or is missing).
- Check all migrations in `prisma/migrations/` — are they in sync with the schema? No drift?
- Check `prisma.config.ts` — is `directUrl` correctly configured for migrations?

### 3. Booking Engine (`/lib/booking/`)
- Read `engine.ts` in full.
- Verify atomic capacity check uses `SELECT ... FOR UPDATE` inside `prisma.$transaction`.
- Verify `createBooking` handles all 4 sources correctly: `card` → `booked`, `onsite_deposit` → `pending_deposit`, `balance` → `booked` (changed in later session).
- Verify `cancelBooking` uses `Studio.cancelWindowHours` (should be 4 hours now).
- Verify `markAttendance` returns `depositBurned: boolean`.
- Check ACTIVE_BOOKING_STATUSES in `statuses.ts` — should include: `booked`, `pending_deposit`, `paid`, `attended`. NOT `no_show` or `cancelled`.
- Run the test suite: `npm test`. All tests must pass. Report any failures with full output.
- Check if the JIT abandoned-checkout cleanup is still present in `createBooking` (added in step 7).

### 4. Authentication & Sessions
- Read `lib/supabase/` files.
- Read `middleware.ts`.
- Verify route protection: `/account` and `/staff` are guarded, `/schedule` is public.
- Verify `syncUserFromSupabase` in `lib/auth/syncUser.ts` normalizes empty phone to `null` (not `""`).
- Check `app/auth/callback/route.ts` — does it handle PKCE code exchange correctly?
- Verify JWT session handling is consistent across server and client components.

### 5. Stripe Integration (`/lib/stripe.ts`, `/lib/payments/`)
- Read `lib/stripe.ts` — does it guard against non-`sk_test_` keys in dev?
- Read `lib/payments/createCheckoutForBooking.ts` — does it create a `Payment` row with correct fields?
- Read `app/api/stripe/webhook/route.ts` — does it verify webhook signature before processing? Does it handle `checkout.session.completed` and flip booking to `paid`?
- Check that the webhook route uses `export const runtime = 'nodejs'` (required for raw body parsing).
- Verify `Payment` rows are being created with `currency: "EUR"` (changed from BGN in later session).
- Check the abandoned-checkout JIT cleanup path in `createBooking` — does it correctly identify abandoned card bookings (source=card, status=booked, no paid Payment, older than 15 min)?

### 6. Deposit Balance System
- Verify `User.depositBalance` exists in schema.
- Verify cancellation in `/app/api/bookings/[id]/cancel/route.ts` adds back to `depositBalance` when `depositForfeited = false`.
- Verify booking with `source=balance` deducts from `depositBalance` in `app/schedule/_actions.ts`.
- Verify booking with `source=balance` gets `status=booked` (not `pending_deposit`) from engine.
- Verify profile page (`/account`) shows `depositBalance` formatted as EUR.
- Verify `BookingCard` shows correct source label for balance bookings.

### 7. Public Schedule (`/app/schedule/`)
- Verify data fetching uses `DATABASE_URL` (pooled, port 6543) not `DIRECT_URL`.
- Verify class times are shown in Europe/Sofia timezone (not raw UTC).
- Verify both Agenda and Week views work.
- Verify `cancelledAt` is fetched on classes — if `ScheduledClass.cancelledAt` doesn't exist yet in schema, flag it as "needed for Phase 2".
- Verify past classes show correctly (dimmed, no booking button).
- Verify dual-trainer classes show both trainer names.
- Check Mon–Sun week grid alignment.

### 8. Staff Attendance (`/app/staff/`)
- Verify `/staff` is protected for `coach` and `admin` roles only (not `member`).
- Verify coach sees only their own classes (filtered by `User.trainerId`).
- Verify admin/super_admin sees all classes.
- Verify `markAttendance` server action re-checks role server-side on every call.
- Verify the `depositBurned` verdict is surfaced in the UI (source-aware money note).

### 9. Profile Page (`/app/account/`)
- Verify bookings are split into "Upcoming" and "Past" correctly (by `startAt` vs now in Sofia time).
- Verify `CancelBookingButton` uses `cancelWindowHours` from the studio (4 hours).
- Verify `ContinuePaymentButton` correctly fetches checkout URL using `supabaseUserId` (not FitLab User ID) for ownership check.
- Verify `BookingCard` shows correct status for each booking source.
- Verify cancelled classes show appropriate status in booking history.

### 10. Environment & Configuration
- Check `.env.example` — does it list all required keys?
  - `DATABASE_URL` (pooled, port 6543)
  - `DIRECT_URL` (direct, port 5432)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Check `CLAUDE.md` — is it up to date with all decisions made across sessions? Key things that must be in CLAUDE.md:
  - Prisma 7 driver-adapter pattern (`@prisma/adapter-pg`)
  - `depositBalance` field and balance booking flow
  - `cancelWindowHours` is 4 hours (not 24)
  - `BookingSource.balance` enum value
  - Partial unique index on Booking
  - Phase 2 admin routes planned at `/admin`

### 11. TypeScript & Build
- Run `npx tsc --noEmit`. Report ALL type errors, not just new ones.
- Run `npm run lint`. Report errors introduced by agent sessions (not pre-existing).
- Run `npm run build`. Must complete successfully.
- Check for any `@ts-ignore` or `any` types that were added as quick fixes — flag each one.

### 12. Dead Code & Consistency
- Check for any commented-out code blocks left by agents.
- Check for any `console.log` statements left in production code paths (not test files).
- Check for duplicate utility functions (e.g., timezone conversion defined in multiple places).
- Check that `formatEurMinor` or equivalent is used consistently everywhere money is displayed.
- Check that all Bulgarian UI strings are consistent — no mixed Bulgarian/English labels in the same component.

---

## Deliverable

Produce a structured audit report with these sections:

### ✅ Things That Are Correct
List what you verified and found to be working as intended.

### ⚠️ Minor Issues (flag, don't fix yet)
Things that are suboptimal but not blocking: inconsistent naming, minor dead code, missing comments, etc.

### 🔴 Critical Issues (fix immediately)
Things that are broken, wrong, or will cause real problems:
- Failing tests
- Wrong business logic (e.g., wrong status set on balance booking)
- Security issues (e.g., missing role check, unverified webhook)
- Build failures
- Data integrity issues

For each critical issue: describe the problem, show the broken code, then fix it and confirm the fix.

### 📋 Missing for Phase 2
Things that don't exist yet but are needed before building the admin panel:
- `ScheduledClass.cancelledAt` field (if missing from schema)
- Any other schema additions needed
- Any CLAUDE.md updates needed

---

## After the Audit

Once the report is complete and critical issues are fixed:
1. Update `CLAUDE.md` with anything that was out of date.
2. Run `npm test` one final time — all tests must be green.
3. Run `npm run build` — must succeed.
4. Commit: `chore: codebase audit and cleanup before Phase 2`

Only then is the codebase ready for Phase 2 (Admin Panel).
