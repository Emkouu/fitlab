/**
 * Brand heartbeat / ECG accent line. Used once under the logo as a subtle
 * brand signature; not repeated, to keep the layout calm.
 */
export function Heartbeat({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 18"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id="hb-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F8B6D9" stopOpacity="0" />
          <stop offset="15%" stopColor="#F8B6D9" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="85%" stopColor="#F8B6D9" />
          <stop offset="100%" stopColor="#F8B6D9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 9 L70 9 L78 9 L84 3 L92 15 L100 5 L108 13 L116 9 L240 9"
        fill="none"
        stroke="url(#hb-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
