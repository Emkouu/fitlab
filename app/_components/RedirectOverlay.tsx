import { Spinner } from "./Spinner";

export function RedirectOverlay({ message = "Пренасочване към плащане..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-white">
      <img src="/logo.png" alt="FitLab" className="h-16 opacity-80" />
      <Spinner size={32} />
      <p className="text-sm font-medium text-[color:var(--brand-purple)]/60">{message}</p>
    </div>
  );
}
