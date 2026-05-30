# FitLab — Practice Description + Class Info Modal

## Context
Users need to be able to tap on a class in the schedule and see more information about it (what the practice is, what to expect). Admins add this description per practice in `/admin/practices`. The description shows in a modal when the user taps anywhere on the class card (not just the "Избор" button).

---

## Part 1: Add Description to Practice model

### Schema change
Add `description` field to `Practice` model in `prisma/schema.prisma`:

```prisma
model Practice {
  id          String @id @default(cuid())
  name        String @unique
  slug        String @unique
  description String? // what this practice is, what to expect — shown in class info modal
  classes     ScheduledClass[]
}
```

Run migration:
```bash
npx prisma migrate dev --name add_practice_description
```

---

## Part 2: Add Description field in Admin Practice Form

### Where
`app/admin/practices/_components/PracticeForm.tsx` (or wherever the practice create/edit form is)

### What to add
Add a **Description** textarea field below the Name and Slug fields:

- **Label**: "Описание"
- **Input**: `<textarea>`, 4–6 rows
- **Placeholder**: "Опиши какво представлява тази практика, какво да очакват участниците, подходяща ли е за начинаещи и т.н."
- **Required**: No (optional field)
- **Max length**: 1000 characters (show character counter below: "X / 1000")

### Zod validation
```typescript
description: z.string().max(1000).optional().nullable()
```

### Server action
Update `upsertPracticeAction` to include `description` in the create/update payload.

### Test
- Open `/admin/practices/[id]/edit` → see Description textarea.
- Add description → save → verify saved in DB.
- Leave empty → save → verify null (not error).

---

## Part 3: Class Info Modal on Public Schedule

When a user taps/clicks on a class card (anywhere on the card, not just "Избор"), open an info modal showing class details including the practice description.

### New component: `ClassInfoModal.tsx`

Create `app/schedule/_components/ClassInfoModal.tsx`.

**Modal content**:
- Practice name (large, bold, display font)
- Practice description (if set — body text, muted color, readable line-height; if not set — omit this section entirely)
- Date + time (formatted Bulgarian, Sofia timezone: "петък, 30.05.2026 г. в 18:00 ч.")
- Duration: "90 мин"
- Trainer(s): "Даниил & Юна" (with small trainer label above)
- Capacity: "12 / 15 места" (booked / total)
- Deposit: "€20.00 депозит"
- Special event note (if `isSpecialEvent` and `eventNotes` set — show in a highlighted soft-pink strip)
- **Bottom CTA**: if class is upcoming and not full and user is logged in → "Запази място" button (magenta, full width) — triggers the existing booking flow. If already booked → "Записан ✓" green pill. If full → "Класът е пълен" red pill. If past → no CTA.

**Modal style**:
- Same style as `BookingModal`: fixed overlay with dark backdrop, centered white panel, `rounded-2xl`, `max-w-sm`, `width: 90%`.
- Slides up from bottom on mobile (or fades in — match existing modal animation with Framer Motion).
- Close button (×) top-right.
- FitLab brand colors throughout.

### How tapping works

**Important**: The card currently has an "Избор" button. Keep that button. The new behavior is:
- Tapping **anywhere on the card** (except the "Избор" button) → opens **ClassInfoModal**
- Tapping **"Избор"** → opens **BookingModal** (existing behavior, unchanged)
- If class is already booked → card shows "Записан ✓" instead of "Избор" → tapping card still opens ClassInfoModal (user can see info even if booked)

### Data needed
The schedule page already fetches class data. Make sure `practice.description` is included in the Prisma query:

```typescript
include: {
  practice: { select: { id: true, name: true, slug: true, description: true } },
  trainers: { select: { id: true, name: true } },
  studio: { select: { name: true, cancelWindowHours: true } },
  // ... existing includes
}
```

Pass `description` through to `ClassCard` → `ClassInfoModal`.

### ClassCard changes
Wrap the card content (everything except the "Избор"/"Записан" button) in a clickable div:

```tsx
<div
  onClick={() => setInfoOpen(true)}
  className="cursor-pointer flex-1"
  role="button"
  aria-label={`Информация за ${row.practice.name}`}
>
  {/* card content: time, name, trainer, capacity */}
</div>

{/* Избор button — separate, stopPropagation so it doesn't trigger info modal */}
<button onClick={(e) => { e.stopPropagation(); openBooking(); }}>
  Избор
</button>
```

---

## Summary of files to create/change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `Practice.description String?` |
| `prisma/migrations/...` | Auto-generated migration |
| `app/admin/practices/_components/PracticeForm.tsx` | Add description textarea |
| `app/admin/_actions.ts` | Include description in upsertPracticeAction |
| `app/schedule/_components/ClassInfoModal.tsx` | NEW — info modal |
| `app/schedule/_components/ClassCard.tsx` | Tap card → open info modal |
| `app/schedule/page.tsx` | Include practice.description in query |

---

## Test
1. Add description to "Виняса Флоу" in `/admin/practices` → save.
2. Open `/schedule` → tap on a Виняса Флоу class card (not the button) → info modal opens with description.
3. Tap another class with no description → info modal opens, description section is absent (no empty space).
4. In info modal, tap "Запази място" → booking flow opens (existing BookingModal).
5. On a class already booked → card shows "Записан ✓" → tap card → info modal opens → shows "Записан ✓" in CTA area.
6. On mobile (380px): modal slides up cleanly, content readable, CTA button easy to tap.

`npm run build` and `npm test` must pass.
Commit: `feat(schedule): practice description in admin + class info modal on card tap`
