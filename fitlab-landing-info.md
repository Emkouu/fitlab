# FitLab — Landing Page Info, Social Links & Sticky Phone Button

## Context
Update the landing page (`/`) with studio information, social media links, and a sticky phone button. The page currently shows only logo + two buttons. We're adding an info section below the buttons.

---

## What to Build

### 1. Info section on landing page (`app/page.tsx`)

Below the existing logo + buttons section, add a clean info section with:

**Studio info block**:
- Studio name: **FitLab Varna**
- Address with map link:
  ```
  📍 ул. Патриарх Евтимий 7а, Варна 9000
  ```
  Wrap in `<a href="https://maps.google.com/?q=Варна,+ул.+Патриарх+Евтимий+7а,+9000" target="_blank">` so it opens Google Maps.
- Phone: **088 241 4863** (plain text, also tappable as `tel:0882414863`)

**Social links**:
Two icon buttons side by side, centered:
- Facebook: link to `https://www.facebook.com/profile.php?id=61557049447834`
- Instagram: link to `https://www.instagram.com/fitlabvarna/`

Use simple SVG icons for Facebook and Instagram (inline SVG, no external icon library needed). Style them: magenta color, 32px, open in `_blank`.

**Design**:
- Section has a subtle divider (`border-t border-gray-100`) above it.
- Soft muted text for address and phone (`text-sm text-gray-500`).
- Address and phone are tappable links (important for mobile).
- Social icons have hover effect (opacity or scale).
- Consistent with the existing landing page style (`#fdfafd` background, same padding/spacing).
- Mobile-first, centered layout.

---

### 2. Sticky phone button (all pages)

A floating sticky button in the bottom-right corner of every page, showing the phone number. Tapping it opens the phone dialer.

**Behavior**:
- Fixed position: `bottom: 1.5rem; right: 1.5rem; z-index: 40`
- Does NOT overlap the main content scroll (stays above content).
- On click: `href="tel:0882414863"`

**Style**:
- Round pill button (not a circle — pill shape to fit the number).
- Magenta background (`var(--brand-magenta)`), white text.
- Content: 📞 **088 241 4863** (phone emoji + number) or just a phone icon + number.
- `font-size: 0.875rem`, `font-weight: 600`.
- Shadow: `box-shadow: 0 4px 12px rgba(0,0,0,0.15)`.
- Hover: slightly darker magenta or scale 1.02.
- Height: minimum 48px (good tap target).

**Where to add**:
Add the sticky button to `app/layout.tsx` so it appears on ALL pages automatically (schedule, account, admin, etc.).

**Exception**: Do NOT show it on `/admin/*` pages — admin doesn't need a phone button. Check the current pathname and hide if it starts with `/admin`.

Since `layout.tsx` is a Server Component, extract the sticky button as a small Client Component (`app/_components/StickyPhoneButton.tsx`) that uses `usePathname()` to check if we're on an admin page.

```tsx
'use client';
import { usePathname } from 'next/navigation';

export function StickyPhoneButton() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  return (
    <a href="tel:0882414863" ...>
      📞 088 241 4863
    </a>
  );
}
```

---

## Test
- Visit `/` → see info section with address (tappable), phone (tappable), Facebook + Instagram icons.
- Tap address on mobile → opens Google Maps.
- Tap phone → opens dialer.
- Sticky phone button visible on `/schedule`, `/account`, `/`.
- Sticky phone button NOT visible on `/admin`, `/admin/schedule`, etc.
- On 380px: info section looks good, not cramped. Sticky button doesn't cover important content.

---

## After Done
- `npm run build` must pass.
- Commit: `feat(landing): studio info, social links, sticky phone button`
