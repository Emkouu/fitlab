# FitLab — Practice Management in Admin

## Context
Practices (e.g., Виняса Флоу, Пилатес, Хатха Йога) are currently seeded as fixed data. The admin needs to be able to create, edit, and delete practices directly from the admin panel without touching the seed file or database manually.

## Where it lives
- `/admin/practices/page.tsx` — list all practices
- `/admin/practices/new/page.tsx` — create form
- `/admin/practices/[practiceId]/edit/page.tsx` — edit form
- `/admin/_actions.ts` — add practice server actions

Add "Практики" link to the `/admin` dashboard nav alongside Schedule, Trainers, Clients, Attendance.

---

## What to Build

### `/admin/practices` — List Page
1. Fetch all `Practice` rows, ordered alphabetically by name.
2. Table columns:
   - Name (e.g., "Виняса Флоу")
   - Slug (e.g., "vinyasa-flow") — read-only display
   - Classes using this practice (count of `ScheduledClass` rows where `practiceId = this.id`)
   - Actions: "Уреди" (link to edit), "Изтрий" (delete button)
3. Button at top: "Добави практика" → link to `/admin/practices/new`.
4. Delete:
   - If practice has 0 associated classes → allow hard delete.
   - If practice has 1+ classes → block delete, show inline error: "Тази практика се използва в [N] класа. Премахни я от класовете, преди да я изтриеш."
   - No soft-delete needed — practices are catalog data.

### `/admin/practices/new` and `/admin/practices/[practiceId]/edit` — Form
Shared `PracticeForm` component used in both create and edit modes.

**Form fields** (React Hook Form + Zod):
- **Name** (text input, required): the Bulgarian display name, e.g., "Виняса Флоу".
- **Slug** (text input, required): URL-safe identifier, e.g., "vinyasa-flow". Auto-generated from name on create (convert to lowercase, replace spaces/special chars with hyphens, strip Cyrillic diacritics). Admin can override manually. Must be unique.

**Validation (Zod)**:
- Name: required, min 2 chars, max 100 chars.
- Slug: required, lowercase, only a-z, 0-9, hyphens. Auto-derived from name but editable. Must be unique (check DB before save).

**Server action `upsertPracticeAction(input)`**:
- On create: check slug uniqueness → insert Practice row → redirect to `/admin/practices?success=created`.
- On edit: check slug uniqueness (excluding own row) → update Practice row → redirect to `/admin/practices?success=updated`.
- Return typed result: `{ ok: true } | { ok: false; message: string }`.
- Re-check admin role server-side before any write.

**Buttons**: "Запази" (magenta, submit), "Отказ" (white border, back to list).

---

## Server Actions (add to `/admin/_actions.ts`)

```typescript
upsertPracticeAction(input: { id?: string; name: string; slug: string })
deletePracticeAction(practiceId: string)
```

Both must:
- Re-check `role: admin` or `role: super_admin` server-side.
- Validate with Zod.
- Return `{ ok: true } | { ok: false; message: string }`.

---

## Slug Auto-Generation Helper

Write a small pure function `generateSlug(name: string): string` in `lib/utils/slug.ts`:
- Lowercase the input.
- Transliterate common Cyrillic characters to Latin equivalents (е.g., В→v, и→i, я→ya, etc.) — cover at least the characters that appear in existing practice names.
- Replace spaces and non-alphanumeric characters with hyphens.
- Collapse multiple hyphens into one.
- Trim leading/trailing hyphens.

Use this function both client-side (to auto-fill the slug field as the admin types the name) and server-side (as a fallback if slug is somehow empty).

---

## Role Enforcement
- `/admin/practices/*` is already under `/admin` middleware guard (admin/super_admin only).
- Re-check role inside every server action.
- Member or coach hitting these routes → redirect to `/schedule`.

---

## Test
1. Open `/admin/practices` — see existing 6 seeded practices with class counts.
2. Click "Добави практика" → type "Стречинг" → slug auto-fills as "strechink" or similar → adjust to "stretching" → Save.
3. Verify "Стречинг" appears in the list with 0 classes.
4. Verify it appears in the practice dropdown when creating a new class in `/admin/schedule/new`.
5. Edit "Стречинг" → rename to "Стречинг & Релаксация" → save → verify name updated in list.
6. Try deleting "Виняса Флоу" (has classes) → blocked with error message.
7. Delete "Стречинг" (0 classes) → removed from list.

Show list + create + blocked delete before committing.

---

## Technical Notes
- Slug uniqueness check: use `prisma.practice.findUnique({ where: { slug } })` before insert/update.
- On edit, exclude own row from uniqueness check: `WHERE slug = ? AND id != ?`.
- The `Practice` model already has `@unique` on both `name` and `slug` — Prisma will throw P2002 on duplicate; catch it and return a friendly message.
- After adding/editing a practice, it automatically appears in the class create/edit form dropdowns (they already read from DB).
- Cyrillic transliteration: cover at minimum: а→a, б→b, в→v, г→g, д→d, е→e, ж→zh, з→z, и→i, й→y, к→k, л→l, м→m, н→n, о→o, п→p, р→r, с→s, т→t, у→u, ф→f, х→h, ц→ts, ч→ch, ш→sh, щ→sht, ъ→a, ю→yu, я→ya. Cover uppercase too.
- All UI text in Bulgarian.

---

## After Done
- Run `npm test` — all tests must pass.
- Run `npm run build` — must succeed.
- Commit: `feat(admin): practice management — CRUD for class types`
- Update CLAUDE.md: note that practices are now managed via /admin/practices, not seeded.
