# FitLab Phase 2 — Admin Dashboard & Schedule Management

## Context
FitLab MVP (steps 1–10) is complete. Now we're building a dedicated admin dashboard at `/admin` for schedule management. The studio owner needs to add/edit/cancel classes. The existing `/staff` endpoint handles staff attendance only; `/admin` is for ownership/administrative tasks.

## Architecture Decisions (locked, no substitutions)

- **Routes**: All `/admin/*` protected by role check — only `super_admin` role allowed (coaches and members cannot access).
- **Schedule changes**: Server actions (`use server`) that call the booking engine and Prisma mutations.
- **Cancelled classes**: Soft-delete via `ScheduledClass.cancelledAt` timestamp (not hard-delete). When a class is cancelled:
  - All active bookings on that class auto-cancel (status → `cancelled`)
  - Refunds fire: card+paid → Stripe refund, balance → restore to `User.depositBalance`, onsite_deposit → no action
  - Bookings show "Класът е отказан" status badge in member profiles
- **Design**: Mobile-first 380px baseline, FitLab brand colors (magenta, purple, soft pink), same design system as schedule/booking UI.
- **Database**: No schema changes needed; use existing patterns (`cancelledAt` already exists or add minimal field).
- **Language**: Bulgarian throughout (all UI text, error messages, labels).
- **Separation**: `/staff` (coaches mark attendance) vs. `/admin` (owner manages schedule). No overlap.

---

## Phase 2 Roadmap — 4 Steps

### Step 11: Admin Dashboard & Class Cancellation

**File structure**:
- `/admin/page.tsx` — dashboard home with quick stats
- `/admin/schedule/page.tsx` — schedule list view
- `/admin/schedule/_components/ScheduleList.tsx` — table component
- `/admin/schedule/_components/CancelClassModal.tsx` — confirmation modal
- `/admin/_actions.ts` — server actions

**Build**:
1. Create `/admin` page (role-protected Server Component, `super_admin` only).
   - Dashboard shows: total upcoming classes (7 days), total active bookings, total refundable balance, cancelled classes (7 days).
   - Quick action buttons: "Виж графика", "Добави клас", "Треньори".
2. Create `/admin/schedule` page.
   - Fetch all upcoming `ScheduledClass` rows (next 7–30 days).
   - Build `ScheduleList` table showing:
     - Date (YYYY-MM-DD, Bulgarian format)
     - Time (HH:mm)
     - Duration (X мин)
     - Practice name
     - Trainer(s) (single or "Trainer1 & Trainer2")
     - Capacity (e.g., "12 места")
     - Current bookings (count of active: booked + pending_deposit + paid + attended)
     - Deposit (formatted EUR, e.g., "€20.00")
     - Actions: "Уреди" (link to edit), "Отмяна" (cancel modal)
3. When admin clicks "Отмяна класа":
   - Modal confirms: "Отмяна на класа на [date time]. Това ще отмени [N] активни записвания. Депозитите ще бъдат върнати. Продължаваш ли?"
   - On confirm, call server action `cancelClassAction(classId)` which:
     - Sets `ScheduledClass.cancelledAt = now`
     - Finds all active bookings on that class
     - For each booking, calculates refund verdict (NOT forfeited — class is being cancelled, not the user)
     - Triggers refund per source:
       - Card + paid → initiate Stripe refund
       - Balance → restore to `User.depositBalance`
       - Onsite → no action (never charged)
     - Updates all bookings to `status = 'cancelled'`
     - Returns success
   - Show toast: "Класът е отказан, [N] депозита са върнати"
   - Redirect to schedule list
4. Cancelled classes show with:
   - Strikethrough text
   - Opacity 50% or grey background
   - "Отказано" badge (deep purple)
5. Handle errors defensively.

**Test**:
- Create 3 classes (Mon, Tue, Wed)
- Book 2 people on Tue class (1 card+paid, 1 balance)
- Admin cancels Tue class
- Verify both bookings move to `cancelled`
- Verify card payment shows refund initiated
- Verify balance user's `depositBalance` increased
- Verify cancelled class shows strikethrough in list

Show dashboard + schedule list + one cancellation test before committing.

---

### Step 12: Admin Create/Edit Class

**File structure**:
- `/admin/schedule/new/page.tsx` — create form
- `/admin/schedule/[classId]/edit/page.tsx` — edit form
- `/admin/schedule/_components/ClassForm.tsx` — shared form component
- `/admin/_actions.ts` — add server action

**Build**:
1. Shared `ClassForm` component (create and edit modes).
2. Form fields (React Hook Form + Zod validation):
   - **Date**: date picker (no past dates; defaults to tomorrow). Sofia local.
   - **Time**: time picker (HH:mm, 00:00–23:45). Converted to UTC in server action.
   - **Duration**: dropdown [45, 55, 60, 70, 80, 90, 100, 120] minutes.
   - **Practice**: select (single), populated from DB.
   - **Trainer(s)**: multi-select (1–2 trainers), populated from Trainer table.
   - **Capacity**: number input, 1–30.
   - **Deposit amount**: EUR text input (e.g., "20.00"), stored as minor units (2000) in DB.
   - **Is special event**: checkbox.
   - **Event notes**: optional textarea.
3. Validation (Zod):
   - Date >= tomorrow
   - Time valid (00:00–23:59)
   - Duration in allowed set
   - Capacity 1–30
   - Deposit >= 0
   - At least one trainer, at most two
4. Server action `upsertClassAction(input)`:
   - Convert local date + time to UTC (use Sofia timezone, same logic as seed)
   - Upsert `ScheduledClass` row (create or update)
   - Update M:N `_ClassTrainers` junction via `connect`/`set`
   - Return new classId or error
5. On success: redirect to `/admin/schedule?success=class_saved`; show toast "Класът е запазен".
6. On error: show inline error; don't redirect.
7. Buttons: "Запази" (magenta, submit), "Отказ" (white border, link back to list).

**Test**:
- Create new class: tomorrow, 18:00, 90 min, Виняса Флоу, Даниил & Юна, 15 места, €20.00
- Verify it appears in schedule list
- Edit it: change time to 19:00
- Verify edit is saved
- Edit trainer: remove Юна, add Елена
- Verify M:N is updated (check `_ClassTrainers`)

Show create + edit flow before committing.

---

### Step 13: Admin Trainer Management

**File structure**:
- `/admin/trainers/page.tsx` — list view
- `/admin/trainers/_components/TrainerList.tsx` — table component
- `/admin/trainers/[trainerId]/edit/page.tsx` — edit form
- `/admin/_actions.ts` — add server action

**Build**:
1. `/admin/trainers` list page:
   - Table: Name, Specialties (comma-separated), Linked user (email or "—"), Actions ("Уреди", "Изтрий").
   - Button: "Добави треньор" (create new).
2. Trainer form (create/edit):
   - **Name**: text input (required).
   - **Photo URL**: text input (optional; future use).
   - **Bio**: textarea (optional).
   - **Specialties**: multi-select from Practice table.
   - **Link to user**: dropdown of Users with no linked trainer, or "None" to unlink.
3. Server action `upsertTrainerAction(input)`:
   - Create or update Trainer row
   - If user link: `UPDATE User SET trainerId = ? WHERE id = ?`
   - If unlink: `UPDATE User SET trainerId = NULL WHERE trainerId = ?`
4. On success: return to list; toast "Треньорът е запазен".
5. Delete: hard-delete only if no classes reference the trainer; otherwise block with a message.

**Test**:
- Create new trainer "Петра", specialties: Пилатес, Хатха Йога
- Link to a User
- Verify `User.trainerId` is set
- Unlink
- Verify `User.trainerId` is NULL
- In schedule create form, verify trainer dropdown includes "Петра"

Show trainer list + one create before committing.

---

### Step 14: Display Cancelled Classes in Public Schedule & Profile

**File structure**: Update
- `/app/schedule/_components/ClassCard.tsx`
- `/app/schedule/_components/BookingModal.tsx`
- `/app/account/_components/BookingCard.tsx`

**Build**:
1. **Public schedule** (`/schedule`):
   - Check `ScheduledClass.cancelledAt` in both Agenda and Week views.
   - If cancelled:
     - Apply CSS: `line-through`, `opacity-50`, grey text.
     - Show "Отказано" badge (deep purple background, white text).
     - Remove or disable "Избор" button; show "Класът е отказан".
   - Still display cancelled classes (don't hide them) so users see why a class is missing.
2. **Profile bookings** (`/account`):
   - Fetch booking's `scheduledClass.cancelledAt`.
   - If set: show booking card with status badge "Класът е отказан" (deep purple).
   - Remove cancel button (class already cancelled by admin).
   - Keep booking visible in history so user sees the refund happened.
3. **Refund status in BookingCard**:
   - If booking was cancelled because the class was cancelled (vs. user-initiated):
     - Show "Депозитът е върнат" (green) if refund processed
     - Show "Класът е отказан — изчаква се рефунд" if refund pending (card bookings)

**Test**:
- Book a class (as member)
- As admin, cancel the class
- Refresh schedule: class shows strikethrough + "Отказано"
- Refresh profile: booking shows "Класът е отказан" + refund status
- Check balance restored (visit balance in profile)

Show schedule + profile changes before committing.

---

## Implementation Order
1. **Step 11**: Dashboard + cancel-class logic. Test refund handling first — it's the riskiest piece.
2. **Step 12**: Create/edit forms (React Hook Form + Zod, matching booking modal patterns).
3. **Step 13**: Trainer CRUD (simpler than schedule CRUD).
4. **Step 14**: Update public schedule + profile to display cancelled state.

## Technical Notes
- **Role enforcement**: middleware check on `/admin/*` — `super_admin` only. Redirect others to `/schedule`. Test denial, not just access (member hitting `/admin` directly → blocked).
- **Refund logic** from step 7 is reusable: loop through active bookings, compute refund verdicts, wire to Stripe / balance / onsite.
- **Critical test**: create a class with 2 bookings (1 card+paid, 1 balance), cancel it, verify both auto-cancel AND refunds fire correctly per source.
- **Cancelled classes**: use `line-through` + `opacity-50` in CSS — don't hide them.
- **Timezone**: reuse the Sofia → UTC conversion logic from the seed for create/edit.
- **All text** (UI, errors, labels) in Bulgarian.

---

## Usage Note
Give Claude Code one step at a time — "Build step 11 only, then stop for review." Review, test, commit after each step before moving on. The class-cancellation refund path (step 11) is the riskiest part — verify the refund test goes green before trusting it.
