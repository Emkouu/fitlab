# FitLab UI Fixes — Schedule, Trainers, Booking State

## Context
Four specific UI issues reported after manual testing. Fix all four in one pass. No new features — only fixes and consistency improvements.

---

## Fix 1: "Записан" state on class cards in public schedule

**Problem**: When a logged-in user already has an active booking for a class, the "Избор" button still shows. It should show "Записан" instead so the user knows they're already booked.

**Where**: `app/schedule/_components/ClassCard.tsx` (and wherever the Избор button is rendered in AgendaView / WeekView).

**How**:
1. The schedule page (`app/schedule/page.tsx`) already fetches the logged-in user. Pass the user's active booking IDs down to the card components.
2. Fetch the user's active bookings for the displayed date range: `prisma.booking.findMany({ where: { userId: profile.id, status: { in: ACTIVE_BOOKING_STATUSES }, scheduledClass: { startAt: { gte: now } } }, select: { scheduledClassId: true } })`.
3. Pass the resulting set of `scheduledClassId` values down through `ScheduleSurface` → `AgendaView`/`WeekView` → `ClassCard`.
4. In `ClassCard`: if `bookedClassIds.has(row.id)` → render a "Записан ✓" pill/badge instead of the "Избор" button. Style: soft green background, deep green text, no pointer cursor (not clickable). Should be clearly distinct from the magenta "Избор" button.
5. If user is not logged in → show "Избор" as normal (anonymous users can't be booked).
6. Past classes (already dimmed) keep their existing dimmed state — don't add "Записан" to past classes.

**Test**:
- Book a class as a logged-in user.
- Return to `/schedule` — that class should show "Записан ✓" instead of "Избор".
- Other classes still show "Избор".
- Log out — all classes show "Избор" again.
- The booked class in the Week view also shows "Записан ✓".

---

## Fix 2: "Редактирай" button in `/admin/schedule` doesn't work

**Problem**: The "Уреди" button on `/admin/schedule` does nothing when clicked.

**How**:
1. Find where the "Уреди" button is rendered in `app/admin/schedule/_components/ScheduleList.tsx` (or wherever the schedule table is).
2. It should be a `<Link href={/admin/schedule/${classId}/edit}>` — check if the href is missing, wrong, or if it's a `<button>` with no action.
3. Fix it to be a proper Next.js `<Link>` pointing to the correct edit route.
4. Verify `/admin/schedule/[classId]/edit/page.tsx` exists and loads the class data correctly.

**Test**:
- Click "Редактирай" on any class → navigates to the edit form with the class data pre-filled.

---

## Fix 3: Cancel modal in `/admin/schedule` — wrong design and not centered

**Problem**: The cancellation confirmation modal doesn't match the FitLab design system and is not centered on screen.

**How**:
1. Find `CancelClassModal.tsx` (or wherever the modal is implemented in `/admin/schedule/`).
2. Replace or restyle it to match the existing `BookingModal` design system:
   - Use a `<dialog>` element or a fixed overlay div with `position: fixed; inset: 0; z-index: 50`.
   - Center the modal panel: `display: flex; align-items: center; justify-content: center` on the overlay.
   - Modal panel: `background: white; border-radius: 1rem; padding: 1.5rem; max-width: 24rem; width: 90%; box-shadow: large`.
   - Backdrop: semi-transparent dark overlay (`bg-black/50`).
   - Header: class details (date, time, practice name).
   - Body text: "Това ще отмени [N] активни записвания. Депозитите ще бъдат върнати на клиентите."
   - Two buttons: "Потвърди отмяна" (magenta, full width) and "Назад" (white border, full width below).
   - Matches FitLab brand: same font, same border-radius, same color tokens as `BookingModal`.
3. On mobile (380px): modal fills 90% of screen width, centered vertically.

**Test**:
- Click "Отмяна" on a class → modal appears centered, correct design.
- Click "Назад" → modal closes, nothing happens.
- Click "Потвърди отмяна" → class is cancelled, toast appears.

---

## Fix 4: Consistent labels and Back buttons across all admin pages

### 4a — "Уреди" → "Редактирай" everywhere

**Problem**: Some pages say "Уреди" (incorrect) instead of "Редактирай" (correct Bulgarian for "Edit").

**Find and replace** in ALL admin components:
- `app/admin/schedule/_components/ScheduleList.tsx` (or table component)
- `app/admin/trainers/_components/TrainerList.tsx`
- `app/admin/clients/_components/ClientList.tsx`
- `app/admin/practices/page.tsx` (or list component)
- Any other admin component with an edit action button

Replace every instance of the label "Уреди" with "Редактирай". This is a text-only change — don't touch the logic or href.

### 4b — Consistent Back button with arrow + breadcrumb

**Problem**: Back buttons across admin pages are inconsistent. The `/admin/attendance` style (arrow + breadcrumb) should be used everywhere.

**Reference** (from `/admin/attendance/[classId]`):
```
← Присъствия / Виняса Флоу 18:00
```
This is: a left arrow icon + the parent section name (clickable link) + slash + current page title (not clickable).

**Apply this pattern to ALL admin detail/form pages**:

| Page | Breadcrumb |
|------|-----------|
| `/admin/schedule/new` | ← График / Нов клас |
| `/admin/schedule/[classId]/edit` | ← График / [Practice name] [time] |
| `/admin/trainers/[trainerId]/edit` | ← Треньори / [Trainer name] |
| `/admin/clients/[userId]` | ← Клиенти / [Client name or email] |
| `/admin/practices/new` | ← Практики / Нова практика |
| `/admin/practices/[practiceId]/edit` | ← Практики / [Practice name] |

**Implementation**:
1. Extract a shared `AdminBreadcrumb` component at `app/admin/_components/AdminBreadcrumb.tsx`:
```tsx
type Props = {
  parentLabel: string;   // e.g., "График"
  parentHref: string;    // e.g., "/admin/schedule"
  currentLabel: string;  // e.g., "Виняса Флоу 18:00"
};
```
2. Style: small text, muted color, left arrow (←) icon before parent link. Parent link is clickable (magenta on hover). Slash separator. Current label is plain text (not a link).
3. Place it at the top of every detail/form page, below the logo header, above the page title.
4. Remove any existing "Назад" plain text buttons and replace with this component.

**Test**:
- Visit `/admin/schedule/new` → see "← График / Нов клас" at top.
- Click "← График" part → navigates back to `/admin/schedule`.
- Visit `/admin/clients/[id]` → see "← Клиенти / [name]" at top.
- Visit `/admin/trainers/[id]/edit` → see "← Треньори / [name]" at top.

---

## Summary of Changes

| Fix | Files affected |
|-----|---------------|
| Fix 1 | `app/schedule/page.tsx`, `ScheduleSurface.tsx`, `AgendaView.tsx`, `WeekView.tsx`, `ClassCard.tsx` |
| Fix 2 | `app/admin/schedule/_components/ScheduleList.tsx` (or similar) |
| Fix 3 | `app/admin/schedule/_components/CancelClassModal.tsx` |
| Fix 4a | All admin list components (text change only) |
| Fix 4b | All admin detail/form pages + new `AdminBreadcrumb` component |

---

## After All Fixes

- Run `npm test` — all tests must pass (these are UI changes, shouldn't affect engine tests).
- Run `npm run build` — must succeed.
- Commit: `fix(ui): Записан state on cards, admin modal design, Редактирай labels, breadcrumb nav`
