import Image from "next/image";
import { Suspense } from "react";
import { Heartbeat } from "@/app/_components/Heartbeat";
import { LoginForm } from "./_components/LoginForm";

export const metadata = {
  title: "FitLab Varna — Вход",
};

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-12 pt-6 font-sans text-[color:var(--brand-ink)]">
      <header className="mb-8">
        <div className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="FitLab Varna"
            width={180}
            height={90}
            priority
            className="h-16 w-auto"
          />
        </div>
        <Heartbeat className="mx-auto mt-2 h-3 w-40 opacity-90" />
      </header>

      <div className="mb-7 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Вход</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--brand-purple)]/70">
          Получи връзка за вход на имейла си.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="h-32 animate-pulse rounded-2xl bg-white/40" aria-hidden />
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
