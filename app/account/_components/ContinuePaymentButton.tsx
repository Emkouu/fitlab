"use client";

import { useState } from "react";
import { getCheckoutUrl } from "../_actions";
import { Spinner } from "@/app/_components/Spinner";
import { RedirectOverlay } from "@/app/_components/RedirectOverlay";

type Props = {
  bookingId: string;
  disabled?: boolean;
  className?: string;
};

export function ContinuePaymentButton({ bookingId, disabled = false, className = "" }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsPending(true);

    try {
      const result = await getCheckoutUrl(bookingId);
      if (result.ok && result.url) {
        setIsRedirecting(true);
        const url = result.url;
        await new Promise((r) => setTimeout(r, 300));
        window.location.href = url;
      } else {
        setError("Неуспешно зареждане на плащането. Опитай отново.");
        setIsPending(false);
      }
    } catch (e) {
      setError("Грешка при свързване. Опитай отново.");
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {isRedirecting && <RedirectOverlay />}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        onClick={handleClick}
        disabled={disabled || isPending}
        type="button"
        className={`w-full min-h-10 flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-magenta)] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[color:var(--brand-purple)] disabled:opacity-60 ${className}`}
      >
        {isPending ? (
          <>
            <Spinner size={18} />
            <span>Зареждане</span>
          </>
        ) : (
          "Продължи плащането"
        )}
      </button>
    </div>
  );
}
