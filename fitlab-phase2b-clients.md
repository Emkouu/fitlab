# FitLab Phase 2b — Client Management & Staff Consolidation

## Context
FitLab has no coach role in practice — only admin users exist. The existing `/staff` attendance flow should be merged into `/admin` so everything is in one place. `/staff` routes become redundant and should be removed or redirected to `/admin`. Client management is added as a new section in `/admin/clients`.

## Architecture Decisions (locked)

- **No coach role in practice**: all staff actions are done by admin/super_admin only.
- **Attendance moves to `/admin`**: `/staff` and `/staff/[classId]` routes are removed. Their logic is reused inside `/admin/attendance`.
- **Client management at `/admin/clients`**: admin can view all users, see their full profile, edit role/balance, and cancel bookings.
- **Server-side role enforcement on every action**: re-check role inside every server action, not just middleware.
- **Design**: mobile-first 380px, FitLab brand colors, same design system.
- **Language**: Bulgarian throughout.

---

## Step 15: Migrate Attendance from /staff to /admin

### What to build

1. **Remove `/staff` routes** (or add a redirect from `/staff` → `/admin/attendance` for any saved bookmarks).
2. Create `/admin/attendance/page.tsx`:
   - Shows all past classes (started before now, in Europe/Sofia) for the last 7 days.
   - Each class shows: date, time, practice, trainer(s), total bookings, how many marked (attended + no_show), how many pending ("Чака").
   - "Необработени" chip (magenta) if any bookings are still unprocessed. "Готово" chip (soft pink) if all are marked.
   - Tap a class → go to `/admin/attendance/[classId]`.
3. Create `/admin/attendance/[classId]/page.tsx`:
   - Shows class summary: date, time, practice, trainer(s), studio.
   - Lists all active bookings for that class.
   - Each row: client name (or email if no name), payment source label ("Карта · платено" / "На място" / "Баланс"), current status chip.
   - Two action buttons per unprocessed row: "Дойде" (magenta) and "Не дойде" (white border).
   - On click: call `markAttendance` from the existing booking engine (`lib/booking/engine.ts`). Re-check admin role server-side in the action before calling engine.
   - After marking: row updates instantly (optimistic UI or server revalidation), buttons disappear, status chip appears.
   - no_show shows source-aware money note (same as old /staff): card → "депозитът е удържан", balance → "балансът е удържан", onsite → "плащане на място".
4. Add "Присъствия" link to the `/admin` dashboard nav.
5. Update middleware: remove `/staff` from any protected prefixes if it was there. Add redirect: `GET /staff → /admin/attendance`.

### Role enforcement
- Every server action that calls `markAttendance` must re-check that the calling user has `role: admin` or `role: super_admin` server-side.
- A member hitting `/admin/attendance/[classId]` directly → redirect to `/schedule`.

### Test
- Open `/admin/attendance` — see past classes.
- Tap a class → see participant list.
- Mark one as "Дойде" → status chip changes instantly.
- Mark another as "Не дойде" → status chip + money note appears.
- Visit `/staff` → redirects to `/admin/attendance`.
- As member (change role via SQL), try `/admin/attendance/[classId]` → blocked.

Show the attendance page working before committing.

---

## Step 16: Client Management — List & Profile View

### File structure
- `/admin/clients/page.tsx` — client list
- `/admin/clients/_components/ClientList.tsx` — table component
- `/admin/clients/[userId]/page.tsx` — client detail/edit page
- `/admin/clients/_components/ClientDetail.tsx` — profile + booking history
- `/admin/_actions.ts` — add client server actions

### What to build

#### `/admin/clients` — List Page
1. Fetch all users with `role: member` (or all roles if admin wants to see everyone — include a role filter toggle).
2. Table columns:
   - Full name (or "—" if not set)
   - Email
   - Phone (or "—" if not set)
   - Role badge (member / admin / super_admin — colored chips)
   - Deposit balance (formatted EUR, e.g., "€15.00"; grey "€0.00" if zero)
   - Total bookings (count of all bookings, any status)
   - Joined date (createdAt, formatted Bulgarian)
   - Action: "Виж профил" → link to `/admin/clients/[userId]`
3. Search bar at top: filter by name or email (client-side filter on loaded data is fine for MVP scale).
4. Sort by: joined date (default, newest first), name, balance.

#### `/admin/clients/[userId]` — Client Detail & Edit
1. **Profile section** (editable):
   - Full name (text input)
   - Email (read-only — auth identifier, don't allow change)
   - Phone (text input)
   - Role (select: member / admin / super_admin)
   - Deposit balance (EUR number input — admin can manually adjust; e.g., add credit or deduct)
   - Save button ("Запази промените") — magenta, calls `updateClientAction`
2. **Booking history section** (read-only list, same style as `/account` BookingCard but without cancel/payment buttons):
   - All bookings for this user, newest first.
   - Show: class name, date, time, trainer, status chip, source label, deposit amount.
   - Status chips: Записан / Чека плащане / Платено / Посетил/а / Не дойде / Отменено / Класът е отказан.
   - For bookings with `status: booked` or `status: pending_deposit` (upcoming, active): show "Анулирай" button.
3. **"Анулирай" booking action**:
   - Admin can cancel any active booking on behalf of a client.
   - Call `cancelBooking` from engine — use `now` so cancellation window applies.
   - If `depositForfeited: false` AND source is card or balance → refund/restore balance.
   - If `depositForfeited: true` → deposit is forfeited (admin is informed, not forced to override).
   - Optional: add an "Override — return deposit anyway" toggle for admin edge cases (admin can choose to refund even if late). This writes to balance directly, bypassing the window check.
   - After cancel: booking row updates to "Отменено" immediately.
4. **Stats bar** (above booking list):
   - Total classes attended
   - Total no-shows
   - Total cancelled (by user)
   - Total spend (sum of paid deposits, formatted EUR)

### Server actions (add to `/admin/_actions.ts`)

```typescript
// Update client profile fields
updateClientAction(userId, { fullName, phone, role, depositBalance })

// Cancel a client's booking (admin on behalf of user)
adminCancelBookingAction(bookingId, { overrideRefund: boolean })
```

Both actions must:
- Re-check that calling user has `role: admin` or `role: super_admin`.
- Validate input with Zod.
- Return typed result (`{ ok: true } | { ok: false; message: string }`).

### Role & safety rules
- Admin cannot change their own role (prevent accidental self-demotion).
- Admin cannot set balance to negative.
- Changing role to `super_admin` is allowed only if the calling user is `super_admin`.
- All edits are logged to console (for now; audit trail is Phase 3).

### Test
- Open `/admin/clients` — see list of all users.
- Search "emila" — filters to matching user.
- Click "Виж профил" → see profile + booking history.
- Change full name → save → verify DB updated.
- Manually adjust balance (e.g., add €5.00) → save → verify `depositBalance` updated.
- Find an active booking → click "Анулирай" → booking moves to "Отменено" instantly.
- Check that deposit was restored to balance if within window and source=balance.
- Try changing own role as admin → blocked.

Show client list + one full profile edit + one booking cancel before committing.

---

## Implementation Order

1. **Step 15 first**: migrate attendance, remove /staff, test redirect. Commit.
2. **Step 16**: client list + detail page. Commit.

## Technical Notes

- Reuse `markAttendance` from `lib/booking/engine.ts` — don't rewrite it.
- Reuse `cancelBooking` from `lib/booking/engine.ts` — don't rewrite it.
- Reuse existing `BookingCard` styles for the booking history section in client detail (or extract shared component).
- Balance adjustment by admin: use `prisma.user.update({ depositBalance: newValue })` directly — it's an admin override, not a booking flow.
- `adminCancelBookingAction` with `overrideRefund: true` bypasses `depositForfeited` verdict and always credits back to balance (if source = card or balance). Use with care.
- Role change: wrap in a check — `if (input.role === 'super_admin' && callingUser.role !== 'super_admin') return { ok: false, message: 'Нямаш права' }`.
- Don't allow email change — it's the Supabase auth identifier. Changing it requires Supabase Admin API and is out of scope.
- All text in Bulgarian.

---

## After Both Steps

Once step 15 and 16 are committed:
1. Run `npm test` — all tests must still pass.
2. Run `npm run build` — must succeed.
3. Commit message: `feat(admin): client management + attendance consolidation`
4. Update CLAUDE.md: note that /staff is removed, attendance is at /admin/attendance, client management at /admin/clients.
