'use client';

import { usePathname } from 'next/navigation';

export type StickyPhoneButtonProps = {
  phone: string;
};

export function StickyPhoneButton({ phone }: StickyPhoneButtonProps) {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;

  const telHref = `tel:${phone.replace(/\s+/g, '')}`;

  return (
    <a
      href={telHref}
      aria-label={`Обади се: ${phone}`}
      className="fixed bottom-6 right-6 z-40 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[color:var(--brand-magenta)] text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform hover:scale-[1.02] hover:bg-[color:var(--brand-purple)]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    </a>
  );
}
