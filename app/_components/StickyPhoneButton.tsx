'use client';

import { usePathname } from 'next/navigation';

export function StickyPhoneButton() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;

  return (
    <a
      href="tel:0882414863"
      aria-label="Обади се: 088 241 4863"
      className="fixed bottom-6 right-6 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[color:var(--brand-magenta)] px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform hover:scale-[1.02] hover:bg-[color:var(--brand-purple)]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
      </svg>
      088 241 4863
    </a>
  );
}
