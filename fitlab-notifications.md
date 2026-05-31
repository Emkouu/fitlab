# FitLab — Waitlist Notifications (Spot Available Alert)

## Context
When a user cancels a booking, other users who are interested in that class should be notified that a spot has opened up. This includes:
1. In-app notification bell (top of schedule page)
2. Email notification via Resend

The `Notification` model already exists in the schema as an empty stub — now we fill it in.

---

## Part 1: Schema — Fill in Notification model

Update `prisma/schema.prisma` — replace the empty `Notification` stub:

```prisma
model Notification {
  id              String           @id @default(cuid())
  userId          String
  user            User             @relation(fields: [userId], references: [id])
  type            NotificationType
  message         String
  scheduledClassId String?
  scheduledClass  ScheduledClass?  @relation(fields: [scheduledClassId], references: [id])
  read            Boolean          @default(false)
  createdAt       DateTime         @default(now())
}

enum NotificationType {
  spot_available
  class_cancelled
  reminder_24h
  reminder_2h
}
```

Add reverse relations:
```prisma
// On User model — add:
notifications  Notification[]

// On ScheduledClass model — add:
notifications  Notification[]
```

Also fill in the `Waitlist` stub:
```prisma
model Waitlist {
  id               String         @id @default(cuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id])
  scheduledClassId String
  scheduledClass   ScheduledClass @relation(fields: [scheduledClassId], references: [id])
  createdAt        DateTime       @default(now())
  notifiedAt       DateTime?      // when we sent the spot_available notification

  @@unique([userId, scheduledClassId])
}
```

Add reverse relations on User and ScheduledClass for Waitlist too.

Run migration:
```bash
npx prisma migrate dev --name fill_notification_and_waitlist_models
```

---

## Part 2: Join Waitlist — "Увеми ме" button

When a class is **full**, instead of just showing "Класът е пълен", show a **"Увеми ме при свободно място"** button.

### Where
In `ClassInfoModal.tsx` and/or `ClassCard.tsx` — where the full state is currently shown.

### Logic
- If class is full AND user is logged in AND user doesn't have active booking → show "🔔 Увеми ме" button (white border, magenta text)
- If user is already on waitlist for this class → show "✓ Ще те уведомим" (greyed out, not clickable)
- If class is not full → show normal "Избор" button (no waitlist option)

### Server action `joinWaitlistAction(scheduledClassId)`
```typescript
// Re-check class is actually full before adding to waitlist
// Upsert Waitlist row (userId + scheduledClassId, unique)
// Return { ok: true } | { ok: false; message: string }
```

---

## Part 3: Notify Waitlist on Cancellation

When a booking is cancelled (in `app/api/bookings/[id]/cancel/route.ts` and `app/admin/_actions.ts` for admin cancels), after the cancellation is processed:

1. Check if the class now has available spots: `remainingSpots = capacity - activeBookingsCount`
2. If `remainingSpots > 0`:
   - Find all Waitlist entries for this class where `notifiedAt IS NULL`, ordered by `createdAt ASC` (first come, first served)
   - For each waitlist entry (up to `remainingSpots` entries):
     - Create a `Notification` row: `{ userId, type: 'spot_available', scheduledClassId, message: 'Освободи се място за [Practice Name] на [date] в [time]!' }`
     - Send email via Resend (see Part 5)
     - Update `Waitlist.notifiedAt = now`
   - Don't notify more people than available spots

### Helper function `lib/notifications/notifyWaitlist.ts`
```typescript
export async function notifyWaitlist(scheduledClassId: string): Promise<void>
```
Pure function, call it after any cancellation (user cancel, admin cancel, class cancel).

---

## Part 4: Notification Bell UI

### Bell icon in header
Add a notification bell icon to the schedule page header (in `ScheduleSurface.tsx`, next to the auth chip).

- Bell icon (SVG, 24px, magenta)
- If user has unread notifications → show a red dot badge on the bell (count or just a dot)
- Clicking the bell → opens a dropdown/panel showing notifications

### Notification panel
Simple dropdown below the bell:
- Title: "Известия"
- List of notifications, newest first
- Each notification row:
  - Icon: 🔔
  - Message: "Освободи се място за Виняса Флоу на петък 30.05 в 18:00!"
  - Time: "преди 5 мин" (relative time)
  - If `read: false` → slightly highlighted background (soft pink)
  - Tap notification → navigate to `/schedule` (or open class info modal) + mark as read
- "Маркирай всички като прочетени" button at top if any unread
- Empty state: "Няма нови известия"
- Max height with scroll if many notifications

### Mark as read
Server action `markNotificationsReadAction(notificationIds[])`:
- Updates `Notification.read = true` for given IDs
- Called when user opens the panel (mark all visible as read)

### Fetch notifications
In `app/schedule/page.tsx` (Server Component), fetch unread notification count for the logged-in user and pass to `ScheduleSurface`. The full list is fetched client-side when bell is clicked (to avoid slowing down initial page load).

```typescript
// Add server action
getNotificationsAction(): Promise<Notification[]>
// Returns last 20 notifications for current user, newest first
```

---

## Part 5: Email notification for spot available

When `notifyWaitlist` runs, send an email to each notified user via Resend.

Email template (inline HTML, same style as magic link email):

**Subject**: `Освободи се място — [Practice Name] на [date] в [time]`

**Body**:
- Header: FitLab gradient (same as magic link email)
- "Освободи се място! 🎉"
- Class details box: practice name, date, time, duration, trainer
- CTA button: "Запази място сега →" → links to `https://fitlabvarna.com/schedule`
- Footer: FitLab Varna address

Use the existing `resend` client from `lib/email/resend.ts` (or create it if not yet done — `RESEND_API_KEY` from env).

If `RESEND_API_KEY` is not set → skip email silently (log warning), don't throw.

---

## Part 6: Waitlist button in Class Info Modal

In `ClassInfoModal.tsx`, update the CTA area:

```
Class is full + user logged in + not on waitlist:
  → "Класът е пълен" red pill + "🔔 Увеми ме при свободно място" button (white border)

Class is full + user logged in + already on waitlist:
  → "✓ Ще те уведомим" grey pill (no button)

Class is full + user NOT logged in:
  → "Класът е пълен" red pill + "Влез за да се запишеш в списъка" muted text

Class not full:
  → normal "Избор" / "Записан" behavior (unchanged)
```

---

## Files to create/change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Fill Notification + Waitlist models |
| `lib/notifications/notifyWaitlist.ts` | NEW — core notification logic |
| `lib/email/sendSpotAvailableEmail.ts` | NEW — Resend email for spot available |
| `app/api/bookings/[id]/cancel/route.ts` | Call notifyWaitlist after cancel |
| `app/admin/_actions.ts` | Call notifyWaitlist after admin cancel + class cancel |
| `app/schedule/_components/ScheduleSurface.tsx` | Add bell icon + unread count |
| `app/schedule/_components/NotificationPanel.tsx` | NEW — dropdown panel |
| `app/schedule/_components/ClassInfoModal.tsx` | Add waitlist button when full |
| `app/schedule/_actions.ts` | Add joinWaitlistAction + getNotificationsAction + markNotificationsReadAction |
| `app/schedule/page.tsx` | Fetch unread count for bell badge |

---

## Test

1. Fill a class to capacity (seed with capacity=1, book it).
2. Second user tries to book → sees "Класът е пълен" + "Увеми ме" button.
3. Second user clicks "Увеми ме" → Waitlist row created → button changes to "Ще те уведомим".
4. First user cancels → `notifyWaitlist` runs → Notification created for second user → email sent.
5. Second user opens schedule → bell shows red dot badge.
6. Second user clicks bell → sees "Освободи се място за..." notification.
7. Clicks notification → marked as read → red dot disappears.
8. Check Resend dashboard → spot available email sent.

`npm run build` and `npm test` must pass.
Commit: `feat(notifications): waitlist + spot available bell + email notifications`
