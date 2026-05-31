# FitLab — Recurring Class Creation + Stay on Form After Save

## Context
Adding classes one by one is slow. The admin needs to be able to add a class that repeats on specific days of the week for the whole month (or a custom range), and after saving, stay on the form ready to add another class instead of being redirected away.

---

## Part 1: Stay on form after saving ("Запази и добави още")

In `app/admin/schedule/new/page.tsx` and the form action, change the post-save behavior.

Instead of always redirecting to `/admin/schedule` after save, show two buttons at the bottom of the form:

```
[Запази и добави още]     [Запази и затвори]
  (white border)              (magenta)
```

**"Запази и затвори"** (existing behavior):
- Saves the class
- Redirects to `/admin/schedule`

**"Запази и добави още"** (new behavior):
- Saves the class
- Shows a success toast/banner: "✓ Класът е добавен успешно!"
- Resets the form to default values (keeps practice, trainer, duration, capacity, deposit pre-filled — only clears date and time so admin can pick the next slot quickly)
- Stays on `/admin/schedule/new`
- Focuses the date picker automatically so admin can pick the next date

To implement: add a hidden input or a state flag `action: 'save_and_add' | 'save_and_close'` to the form. The server action returns `{ ok: true, action }` and the client decides whether to redirect or reset.

---

## Part 2: Recurring class creation

Add a **"Повтарящ се клас"** toggle/section in the class form.

When enabled, the admin specifies a recurrence pattern and the system creates multiple `ScheduledClass` rows at once.

### UI — Recurrence section

Add below the date/time fields, collapsed by default. A checkbox or toggle to enable:

**"🔁 Повтаря се"** (toggle, default OFF)

When toggled ON, show:

**Повтаря се в дните:** (multi-select checkboxes, horizontal)
```
[ ] Пон  [ ] Вт  [ ] Ср  [ ] Чет  [ ] Пет  [ ] Съб  [ ] Нед
```

**До дата:** (date picker, default = end of current month)

**Брой класове:** (auto-calculated, read-only display)
"Ще бъдат създадени X класа" — updates live as weekdays and end date are selected.

**Preview** (optional but nice): small list showing the first 5 dates that will be created, e.g.:
```
пон, 02.06.2026
пон, 09.06.2026
пон, 16.06.2026
...и още 2
```

### Validation
- At least one weekday selected (if recurrence is ON)
- End date must be after the start date
- End date max 3 months from start date (prevent creating hundreds of classes by mistake)
- Max 50 classes per recurrence batch (show warning if exceeded)

### Server action changes

Update `upsertClassAction` to handle recurrence:

```typescript
type UpsertClassInput = {
  // existing fields...
  recurrence?: {
    weekdays: number[]; // 0=Mon, 1=Tue, ..., 6=Sun
    endDate: string;    // "YYYY-MM-DD"
  }
}
```

When `recurrence` is provided:
1. Calculate all dates between `startDate` and `endDate` that fall on the selected weekdays
2. For each date, create a `ScheduledClass` row with the same time, duration, practice, trainers, capacity, deposit
3. Use `prisma.scheduledClass.createMany` for efficiency (or loop with individual creates for M:N trainer relation)
4. Return `{ ok: true, count: N }` where N is number of classes created

**Important**: M:N trainer relation can't use `createMany` — use a loop with `prisma.scheduledClass.create` for each date, connecting trainers each time. It's slightly slower but correct.

### Success feedback

After recurring save:
- "✓ Създадени са 12 класа успешно!" toast
- If "Запази и добави още" → reset form, stay on page
- If "Запази и затвори" → redirect to `/admin/schedule`

---

## Helper function `lib/schedule/generateRecurringDates.ts`

Pure function — easy to test:

```typescript
export function generateRecurringDates(
  startDate: string,    // "YYYY-MM-DD" — first occurrence
  endDate: string,      // "YYYY-MM-DD" — last possible date
  weekdays: number[],   // 0=Mon, 1=Tue, ..., 6=Sun (ISO weekday - 1)
  time: string,         // "HH:mm" Sofia local
): string[] // returns array of "YYYY-MM-DD" dates
```

Logic:
- Start from `startDate`, iterate day by day until `endDate`
- Include a date if `getISODay(date) - 1` is in `weekdays` array (date-fns `getISODay` returns 1=Mon...7=Sun)
- Include `startDate` itself if it matches a selected weekday
- Return array of "YYYY-MM-DD" strings

Install date-fns if not present: `npm install date-fns`

Write unit tests for this function in `lib/schedule/generateRecurringDates.test.ts`:
- Single weekday, one month → correct count
- Multiple weekdays → correct dates
- End date before start → empty array
- Start date is a selected weekday → included

---

## Files to create/change

| File | Change |
|------|--------|
| `app/admin/schedule/new/page.tsx` | Two save buttons |
| `app/admin/schedule/_components/ClassForm.tsx` | Recurrence UI section + two buttons |
| `app/admin/_actions.ts` | Handle recurrence in upsertClassAction |
| `lib/schedule/generateRecurringDates.ts` | NEW — pure helper |
| `lib/schedule/generateRecurringDates.test.ts` | NEW — unit tests |

---

## Test

**"Запази и добави още"**:
- Fill form → click "Запази и добави още" → success toast → form resets (date/time cleared, rest kept) → can add another class immediately.

**Single class (recurrence OFF)**:
- Same as before, both buttons work.

**Recurring class**:
- Select Понеделник + Сряда, end date = end of month, time 18:00
- Preview shows correct dates
- Click save → N classes created in DB
- `/admin/schedule` shows all N classes

**Edge cases**:
- 0 weekdays selected with recurrence ON → blocked by validation
- End date before start date → blocked
- More than 50 classes → warning shown

`npm run build` and `npm test` must pass.
Commit: `feat(admin): recurring class creation + stay on form after save`
