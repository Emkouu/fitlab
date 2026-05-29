# FitLab — Email Reminders

## Context
Send automated email reminders to users before their upcoming classes. Use Resend (https://resend.com) — it's the standard email provider for Next.js/Vercel projects, has a generous free tier (3,000 emails/month), and works well with React Email for templates.

## What to Build

### 1. Install dependencies
```bash
npm install resend @react-email/components
```

### 2. Reminder logic — when to send
Two reminders per booking:
- **24 hours before** the class starts (Sofia time)
- **2 hours before** the class starts (Sofia time)

Only send if the booking status is active: `booked`, `pending_deposit`, or `paid`. Do NOT send if `cancelled`, `no_show`, `attended`.

### 3. Email template (`emails/ClassReminder.tsx`)
Build with `@react-email/components`. Clean, branded template:

**Subject line**:
- 24h: `Утре те чакаме — [Practice Name] в [HH:mm]`
- 2h: `До 2 часа — [Practice Name] в [HH:mm]`

**Email body**:
- FitLab Varna logo at top (use the public URL of the logo once deployed, or a placeholder for now)
- Greeting: `Здравей, [fullName или "приятелю"]!`
- Class details box:
  - Practice name (bold)
  - Date + time (Sofia timezone, Bulgarian format: "петък, 30.05.2026 г. в 18:00 ч.")
  - Duration: "90 мин"
  - Trainer(s): "Даниил & Юна"
  - Studio: "FitLab Varna"
  - Address: "ул. Патриарх Евтимий 7а, Варна"
- Deposit reminder (if status is `pending_deposit`): "Не забравяй да платиш депозита на място преди класа."
- Cancellation reminder: "Можеш да откажеш до [cancelWindowHours] часа преди класа. След това депозитът се удържа."
- CTA button: "Виж резервацията си" → link to `https://[DOMAIN]/account`
- Footer: FitLab Varna | ул. Патриарх Евтимий 7а, Варна | fitlabvarna.com (or localhost for dev)
- Social links in footer: Facebook + Instagram icons (use emoji or simple text links for now)

### 4. Resend setup (`lib/email/resend.ts`)
```typescript
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY);
```

Add to `.env`:
```
RESEND_API_KEY=re_...
```
Add to `.env.example`:
```
RESEND_API_KEY=re_your_resend_api_key
```

### 5. Send function (`lib/email/sendReminder.ts`)
Pure function:
```typescript
sendClassReminder(bookingId: string, type: '24h' | '2h'): Promise<{ ok: boolean }>
```
- Fetch booking with class, practice, trainer(s), studio, user (email + fullName).
- Check status is still active (guard against cancelled bookings between scheduling and sending).
- Render `ClassReminder` email template with the data.
- Call `resend.emails.send(...)`.
- Log success/failure with console.log (audit trail Phase 3).
- Return `{ ok: true }` or `{ ok: false }`.

### 6. Scheduled reminders via Vercel Cron (`app/api/cron/reminders/route.ts`)
Vercel cron runs every 15 minutes and finds bookings that need a reminder sent.

```typescript
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

The cron route:
1. Verify the request has the correct `CRON_SECRET` header (add `CRON_SECRET=random-string` to `.env`). Reject unauthorized requests with 401.
2. Find bookings needing a 24h reminder:
   - `scheduledClass.startAt` is between `now + 23h45m` and `now + 24h15m` (30-minute window around the 24h mark)
   - `status IN (booked, pending_deposit, paid)`
   - `reminder24hSentAt IS NULL` (don't double-send)
3. Find bookings needing a 2h reminder:
   - `scheduledClass.startAt` is between `now + 1h45m` and `now + 2h15m`
   - `status IN (booked, pending_deposit, paid)`
   - `reminder2hSentAt IS NULL`
4. For each found booking, call `sendClassReminder(bookingId, type)`.
5. On success, set `reminder24hSentAt` or `reminder2hSentAt` to `now` on the booking row.
6. Return JSON summary: `{ sent24h: N, sent2h: M, errors: [] }`.

### 7. Schema additions (new migration)
Add to `Booking` model in `schema.prisma`:
```prisma
reminder24hSentAt  DateTime?
reminder2hSentAt   DateTime?
```
Run `npx prisma migrate dev --name add_reminder_fields`.

### 8. Add to CLAUDE.md
Note: email reminders use Resend + Vercel Cron. Cron runs every 15 min. Reminder fields on Booking model.

---

## Setup Instructions for Developer
1. Create account at https://resend.com (free tier: 3,000 emails/month).
2. Add a sending domain or use Resend's test domain for development.
3. Get API key → add to `.env` as `RESEND_API_KEY`.
4. For local testing, use Resend's test mode (emails go to Resend dashboard, not real inbox).
5. For Vercel cron: add `CRON_SECRET` to `.env` and Vercel environment variables.

---

## Test
- Create a booking.
- Manually call the cron endpoint: `curl -H "Authorization: Bearer [CRON_SECRET]" http://localhost:3000/api/cron/reminders`
- Check Resend dashboard — email should appear.
- Call again — `reminder24hSentAt` is set, email NOT sent again (idempotent).
- Cancel the booking, call cron — email NOT sent (status check).

Show the cron endpoint working + Resend dashboard showing the email before committing.

---

## After Done
- `npm test` must pass.
- `npm run build` must pass.
- Commit: `feat(email): class reminders via Resend + Vercel Cron (24h and 2h before class)`
