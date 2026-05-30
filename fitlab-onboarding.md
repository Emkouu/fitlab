# FitLab — First-Time User Onboarding (Name + Phone)

## Context
When a user logs in for the first time via magic link, they should be asked to complete their profile (full name + phone number) before being redirected to the schedule. On subsequent logins, they go directly to the schedule as usual.

## How to Detect "First Time"

A user is "first time" if their `User` record has `fullName IS NULL` (or empty string). This is set during `syncUserFromSupabase` in `lib/auth/syncUser.ts` — new users are created with `fullName: null`.

So the check is simple: after auth callback, if `profile.fullName` is null or empty → redirect to `/onboarding`. If it's set → redirect to the intended page (schedule or wherever they were going).

---

## Flow

```
Magic link click
  → /auth/callback (existing)
    → syncUserFromSupabase (existing)
      → if fullName is null → redirect to /onboarding
      → if fullName is set → redirect to /schedule (or ?next= param)
```

---

## Part 1: Update `/auth/callback/route.ts`

After `syncUserFromSupabase`, check if the user needs onboarding:

```typescript
const profile = await prisma.user.findUnique({
  where: { supabaseUserId: user.id },
  select: { fullName: true }
});

const needsOnboarding = !profile?.fullName || profile.fullName.trim() === '';

if (needsOnboarding) {
  return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
}

// existing redirect logic (next param or /schedule)
```

---

## Part 2: Build `/onboarding` page

### File structure
- `app/onboarding/page.tsx` — server component, checks auth (redirect to /login if not logged in)
- `app/onboarding/_components/OnboardingForm.tsx` — client component with the form
- `app/onboarding/_actions.ts` — server action to save profile

### Page design
Same style as `/login` page:
- Logo + heartbeat line at top
- Centered card, mobile-first 380px
- FitLab brand colors

**Heading**: "Добре дошъл/а! 👋"
**Subtext**: "Преди да продължиш, кажи ни малко за себе си."

### Form fields (React Hook Form + Zod)

**Пълно име** (required):
- Text input
- Placeholder: "Иван Иванов"
- Validation: required, min 2 chars, max 100 chars

**Телефон** (required):
- Text input, type="tel"
- Placeholder: "088 888 8888"
- Validation: required, Bulgarian phone format (08X XXX XXXX or +359...)
- Store normalized: strip spaces, store as entered (don't force E.164 for now)
- Note: this is different from Supabase auth phone — this is just contact info stored in our User table

**Submit button**: "Продължи →" (magenta, full width)

### Zod schema
```typescript
const onboardingSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(6).max(20), // loose validation, just require something
});
```

### Server action `completeOnboardingAction(input)`

```typescript
'use server'
// 1. Get current Supabase user
// 2. Find FitLab User by supabaseUserId
// 3. Update: fullName + phone
// 4. Return { ok: true } | { ok: false; message: string }
```

```typescript
await prisma.user.update({
  where: { id: profile.id },
  data: {
    fullName: input.fullName,
    phone: input.phone,
  }
});
```

After successful save, client redirects to `/schedule`:
```typescript
// in OnboardingForm after action returns ok:true
router.push('/schedule');
```

### Protect the page
- If user is NOT logged in → redirect to `/login`
- If user IS logged in AND already has `fullName` → redirect to `/schedule` (they shouldn't be here)

---

## Part 3: Update Middleware

Add `/onboarding` to protected routes (requires auth):

```typescript
// In lib/supabase/middleware.ts PROTECTED_PREFIXES
'/onboarding'
```

But allow access if logged in (don't redirect logged-in users away from it — only redirect if they already completed onboarding, handled by the page itself).

---

## Part 4: Show name in profile and admin

After onboarding, the user has `fullName` set. Make sure:

1. `/account` page shows `fullName` (likely already does — verify).
2. `/admin/clients` list shows the name (likely already does — verify).
3. Booking modal greeting (if any) uses the name.

---

## Edge Cases

- User closes the tab mid-onboarding → next login, `fullName` still null → shown onboarding again. ✓
- User submits empty name → Zod blocks, shows inline error. ✓
- User already has name (existing users from testing) → skip onboarding, go to schedule. ✓
- Admin users → same flow. If admin logs in for first time, they also go through onboarding. ✓

---

## Test

1. Create a fresh user (new email, never logged in before).
2. Send magic link → click → after callback, redirected to `/onboarding`.
3. Fill in name + phone → submit → redirected to `/schedule`.
4. Log out → log in again with same email → goes directly to `/schedule` (no onboarding).
5. Visit `/onboarding` while logged in with complete profile → redirected to `/schedule`.
6. Visit `/onboarding` while NOT logged in → redirected to `/login`.

`npm run build` must pass.
Commit: `feat(auth): first-time onboarding flow — collect name and phone after magic link login`
