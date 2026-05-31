# FitLab — UX Improvements (Filter, Booking Email, Admin Calendar, Empty State)

## Context
Four UX improvements to make the app more polished and user-friendly.

---

## Improvement 1: Practice Filter on Public Schedule

Add a filter dropdown above the class list on `/schedule` so users can quickly find classes by practice type.

### Where
In `app/schedule/_components/ScheduleSurface.tsx` — above the Списък/Месец toggle.

### UI
A horizontal scrollable row of filter pills (not a dropdown — pills are better on mobile):

```
[Всички]  [Виняса Флоу]  [Пилатес]  [Хатха Йога]  [Ин Йога]  ...
```

- "Всички" is selected by default (shows all classes)
- Each pill is a practice name fetched from DB
- Active pill: magenta background, white text
- Inactive pill: white background, magenta border, magenta text
- Horizontally scrollable if many practices (no wrap)
- `overflow-x: auto; white-space: nowrap; scrollbar-width: none`

### Behavior
- Filtering is **client-side** (data already loaded, just hide non-matching cards)
- In Списък view: hide day sections that have no matching classes after filter. If a day has 3 classes but filter shows only 1, show the day header + that 1 class
- If a day has 0 matching classes after filter → hide the entire day section
- In Месец view: dots only show on days that have matching classes for the selected filter
- When user taps a day in month view → show only matching classes for that day
- Filter state resets when toggling between Списък and Месец (or keep it — your choice, keeping it is more UX-friendly)

### Data
Pass all practices to `ScheduleSurface` from `app/schedule/page.tsx`:
```typescript
const practices = await prisma.practice.findMany({
  orderBy: { name: 'asc' },
  select: { id: true, name: true }
});
```

Filter pills render from this list. Selected filter = `practiceId | null` (null = all).

---

## Improvement 2: Booking Confirmation Email

When a user successfully creates a booking (any source: card, balance, onsite), send a confirmation email.

### When to send
- **Card bookings**: send after Stripe webhook confirms `paid` (in `app/api/stripe/webhook/route.ts` after status flips to `paid`)
- **Balance bookings**: send immediately after `bookClassAction` succeeds (in `app/schedule/_actions.ts`)
- **Onsite bookings**: send immediately after `bookClassAction` succeeds

### Email template `lib/email/sendBookingConfirmationEmail.ts`

Subject: `Записан/а си! [Practice Name] — [date] в [HH:mm]`

Body (inline CSS, same style as magic link email):

```
[FitLab gradient header]

Записан/а си! 🎉

Здравей, [fullName]!

Успешно запази място за:

┌─────────────────────────────┐
│  Виняса Флоу                │
│  петък, 30.05.2026 в 18:00  │
│  90 мин · Даниил & Юна      │
│  FitLab Varna               │
│  ул. Патриарх Евтимий 7а    │
└─────────────────────────────┘

Депозит: €20.00 [статус]
  - "Платено онлайн" (card+paid)
  - "Ще платиш на място" (onsite)
  - "Платено с баланс" (balance)

⚠️ Можеш да откажеш до [cancelWindowHours] часа преди класа.
   След това депозитът се удържа.

[бутон: Виж резервацията си →] → fitlabvarna.com/account

[footer: FitLab Varna · адрес · телефон]
```

### Helper function signature
```typescript
export async function sendBookingConfirmationEmail(bookingId: string): Promise<void>
```
- Fetches booking with class, practice, trainers, studio, user (email + fullName)
- Renders template with the data
- Sends via Resend
- If `RESEND_API_KEY` not set → skip silently (log warning)
- If user has no email → skip silently

### Where to call it
1. `app/api/stripe/webhook/route.ts` — after `status: 'paid'` update → call `sendBookingConfirmationEmail(bookingId)`
2. `app/schedule/_actions.ts` — after `createBooking` succeeds for balance/onsite sources → call `sendBookingConfirmationEmail(booking.id)`
3. Do NOT send for card bookings before Stripe confirms — user hasn't paid yet

---

## Improvement 3: Monthly Calendar View in Admin Schedule

The admin schedule at `/admin/schedule` is a long flat list. Add a calendar toggle so admin can see which days are busy at a glance.

### Where
`app/admin/schedule/page.tsx` and a new `AdminScheduleCalendar.tsx` component.

### UI
Add a toggle above the schedule list (same pill style as public schedule):
```
[Списък]  [Календар]
```

**Списък** = existing table (unchanged)

**Календар** = monthly calendar view, similar to the public MonthView but with admin-specific info:
- Each day cell shows: date number + count of classes (e.g., "3 класа")
- Days with classes: magenta dot + count badge
- Cancelled classes: don't count toward the dot
- Today: highlighted with magenta ring
- Click a day → shows the classes for that day below the calendar (same table format as the list view, filtered to that day)
- Prev/Next month navigation

Reuse the `getClassesForMonth` server action from the public schedule (or create an admin version that includes cancelled classes too, shown with strikethrough).

### Style
Same calendar style as public MonthView — white card, rounded-2xl, magenta accents. Admin-specific: show class count per day instead of just a dot.

---

## Improvement 4: Empty Profile State — Guide New Users

When a logged-in user has no upcoming bookings, the `/account` page shows an empty state. Make it welcoming and actionable.

### Current state
Probably shows: "Нямаш предстоящи тренировки" — plain text, nothing else.

### New empty state (for upcoming bookings tab)
Replace with a warm, branded empty state card:

```
🏃‍♀️

Все още нямаш запазени тренировки

Разгледай графика и запази първата си тренировка —
депозитът се връща при навременна отмяна.

[бутон: Виж графика →]  ← links to /schedule, magenta, full width
```

Style: centered, soft pink background card (`#FFF0F8`), rounded-2xl, magenta accent on the icon, body text muted purple.

### Also: empty past bookings tab
If past bookings tab is empty:
```
Все още нямаш минали тренировки.
```
Plain muted text is fine here — no CTA needed.

### Also: show user's name in account header
If `profile.fullName` is set, show a personalized greeting at the top of `/account`:
```
Здравей, Мария! 👋
```
In the display font (Unbounded), magenta color, above the bookings section. If no name → don't show the greeting (edge case for old users without onboarding).

---

## Files to create/change

| File | Change |
|------|--------|
| `app/schedule/page.tsx` | Fetch practices, pass to ScheduleSurface |
| `app/schedule/_components/ScheduleSurface.tsx` | Add filter pills, pass filter to views |
| `app/schedule/_components/AgendaView.tsx` | Filter classes by practiceId |
| `app/schedule/_components/MonthView.tsx` | Filter dots by practiceId |
| `lib/email/sendBookingConfirmationEmail.ts` | NEW — confirmation email |
| `app/api/stripe/webhook/route.ts` | Call confirmation email after paid |
| `app/schedule/_actions.ts` | Call confirmation email for balance/onsite |
| `app/admin/schedule/page.tsx` | Add Списък/Календар toggle |
| `app/admin/schedule/_components/AdminScheduleCalendar.tsx` | NEW — admin calendar view |
| `app/account/page.tsx` | Personalized greeting |
| `app/account/_components/BookingsList.tsx` | Empty state with CTA |

---

## Test

**Filter**:
- Open `/schedule` → see practice filter pills
- Tap "Пилатес" → only Pilates classes show in agenda
- Month view → only days with Pilates classes show dots
- Tap "Всички" → all classes show again

**Booking confirmation email**:
- Book a class with balance → receive confirmation email
- Book with card → complete Stripe payment → receive confirmation email
- Check Resend dashboard → email logged

**Admin calendar**:
- Open `/admin/schedule` → toggle to Календар
- See monthly grid with class counts per day
- Click a day → see that day's classes below
- Navigate months → data updates

**Empty state**:
- New user with no bookings → sees welcoming empty state with "Виж графика →" button
- Clicks button → goes to /schedule
- User with name → sees "Здравей, Мария! 👋" greeting

`npm run build` and `npm test` must pass.
Commit: `feat(ux): practice filter, booking confirmation email, admin calendar, empty state improvements`
