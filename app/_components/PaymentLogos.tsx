/**
 * Card-scheme acceptance marks required by the acquiring bank (Fibank virtual
 * POS instruction §I.2): must appear on the landing page and everywhere the
 * client picks a payment method. Simplified vector marks — replace with the
 * official artwork pack from the bank/schemes if their review requires it.
 *
 * No hooks — safe in both server and client components.
 */
export function PaymentLogos({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <Badge title="Visa">
        <VisaMark />
      </Badge>
      <Badge title="Mastercard">
        <MastercardMark />
      </Badge>
      <Badge title="Visa Secure">
        <VisaSecureMark />
      </Badge>
      <Badge title="Mastercard Identity Check">
        <IdCheckMark />
      </Badge>
    </div>
  );
}

function Badge({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className="flex h-8 min-w-[3.25rem] items-center justify-center rounded-lg border border-gray-200 bg-white px-2"
    >
      {children}
      <span className="sr-only">{title}</span>
    </span>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 48 16" aria-hidden className="h-3.5 w-auto">
      <text
        x="24"
        y="13"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontStyle="italic"
        fontWeight="bold"
        fill="#1434CB"
        letterSpacing="1"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardCircles({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" aria-hidden className={className}>
      <circle cx="19" cy="12" r="9" fill="#EB001B" />
      <circle cx="29" cy="12" r="9" fill="#F79E1B" />
      <path d="M24 4.52A9 9 0 0 1 24 19.48A9 9 0 0 1 24 4.52Z" fill="#FF5F00" />
    </svg>
  );
}

function MastercardMark() {
  return <MastercardCircles />;
}

function VisaSecureMark() {
  return (
    <svg viewBox="0 0 48 24" aria-hidden className="h-5 w-auto">
      <text
        x="24"
        y="12"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="12"
        fontStyle="italic"
        fontWeight="bold"
        fill="#1434CB"
        letterSpacing="0.5"
      >
        VISA
      </text>
      <text
        x="24"
        y="21"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7"
        fontWeight="bold"
        fill="#1A1F71"
        letterSpacing="1.5"
      >
        SECURE
      </text>
    </svg>
  );
}

function IdCheckMark() {
  return (
    <span className="flex items-center gap-1">
      <MastercardCircles className="h-4 w-auto" />
      <span className="font-sans text-[9px] font-bold leading-none text-gray-700">
        ID Check
      </span>
    </span>
  );
}
