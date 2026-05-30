# FitLab — Admin Navigation Restructure + Settings

## Context
The admin dashboard navigation is currently unorganized. We need to restructure it into logical groups and add a Settings section for studio configuration.

---

## Part 1: Reorganize Admin Navigation

### New nav structure (order matters)

Group the nav links into logical sections:

**📅 График** (Schedule management)
- Виж графика → `/admin/schedule`
- Добави клас → `/admin/schedule/new`

**👥 Хора** (People)
- Клиенти → `/admin/clients`
- Треньори → `/admin/trainers`

**🏃 Дейности** (Activities)
- Практики → `/admin/practices`
- Присъствия → `/admin/attendance`

**⚙️ Настройки** (Settings)
- Настройки → `/admin/settings` (new — see Part 2)

### Where to apply
The navigation appears in `app/admin/page.tsx` (the dashboard home). It likely shows as a grid of quick-action buttons. Restructure them into the groups above.

**Design**:
- Keep the existing card/button style but group them visually with a small section label above each group (e.g., "График", "Хора", etc.) in muted uppercase small text.
- Section labels: `text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2`
- Groups separated by a small gap (`mb-6` between groups).
- Each button/card keeps the existing style (magenta accent, rounded, etc.).
- Mobile-first: single column on 380px, 2-column grid on wider screens if that's the current layout.

---

## Part 2: Settings Page (`/admin/settings`)

### File structure
- `app/admin/settings/page.tsx` — settings page
- `app/admin/_actions.ts` — add `updateStudioSettingsAction`

### What settings to show

**Studio Info** (editable):
- Studio name (text input) — currently hardcoded as "FitLab Varna"
- Address (text input) — "ул. Патриарх Евтимий 7а, Варна 9000"
- Phone (text input) — "088 241 4863"
- Facebook URL (text input)
- Instagram URL (text input)

**Booking Rules** (editable):
- Cancellation window in hours (number input, 1–48) — currently `Studio.cancelWindowHours = 4`
- Default deposit amount in EUR (number input) — used as default when creating new classes

**Save button**: "Запази настройките" (magenta, full width on mobile)

### Where to store settings
Use the existing `Studio` model — it already has `cancelWindowHours`. Add the missing fields:

```prisma
model Studio {
  // existing fields...
  cancelWindowHours  Int     @default(4)
  // add these:
  address           String?
  phone             String?
  facebookUrl       String?
  instagramUrl      String?
  defaultDeposit    Int     @default(2000) // EUR cents
}
```

Run migration: `npx prisma migrate dev --name add_studio_settings`

### Server action `updateStudioSettingsAction(input)`
- Re-check `role: super_admin` or `admin` server-side.
- Validate with Zod.
- Update the Studio row (there's only one studio in MVP).
- Return `{ ok: true } | { ok: false; message: string }`.
- On success: show toast "Настройките са запазени" and revalidate the page.

### Design
- Same admin page style (logo, breadcrumb `← ADMIN`, page title "Настройки").
- Form groups with labels, same input style as ClassForm.
- Two sections with subtle dividers: "Информация за студиото" and "Правила за записване".
- Cancellation window: show helper text "Членовете могат да откажат до X часа преди клас. След това депозитът се удържа."
- Default deposit: show helper text "Използва се като начална стойност при добавяне на нов клас."

### Breadcrumb
`← ADMIN` (links to `/admin`)

---

## Part 3: Use Studio Settings Dynamically

Once settings are stored in DB, use them dynamically instead of hardcoded values:

1. **Landing page** (`app/page.tsx`): fetch `studio.address`, `studio.phone`, `studio.facebookUrl`, `studio.instagramUrl` from DB and use them in the info section (instead of hardcoded strings). If a field is null/empty, hide that element gracefully.

2. **Sticky phone button** (`app/_components/StickyPhoneButton.tsx`): fetch phone from DB (pass as prop from layout or use a separate fetch). If phone is null, don't render the button.

3. **Booking modal cancellation text**: already reads `studio.cancelWindowHours` — no change needed.

4. **New class form default deposit**: pre-fill deposit field with `studio.defaultDeposit / 100` (converted from cents to EUR display value).

---

## Test

**Navigation**:
- Visit `/admin` → see grouped nav: График / Хора / Дейности / Настройки sections.
- All links work correctly.
- "Добави клас" goes to `/admin/schedule/new`.

**Settings**:
- Visit `/admin/settings` → see form with current studio values.
- Change cancellation window to 6 → save → visit booking modal → shows "6 часа".
- Change phone to a different number → save → sticky button shows new number.
- Change Facebook URL → save → landing page footer shows new URL.
- Change default deposit to 15.00 → save → open `/admin/schedule/new` → deposit field pre-filled with 15.00.

---

## After Done
- `npm test` must pass.
- `npm run build` must pass.
- Update CLAUDE.md: note that studio settings (address, phone, social links, cancelWindowHours, defaultDeposit) are stored in the Studio model and managed via `/admin/settings`.
- Commit: `feat(admin): restructured nav with groups + settings page with studio configuration`
