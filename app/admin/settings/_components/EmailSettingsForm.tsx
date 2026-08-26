"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  emailSettingsSchema,
  type EmailSettingsInput,
} from "@/lib/validation/emailSettingsForm";
import {
  updateEmailSettingsAction,
  sendTestEmailAction,
} from "@/app/admin/_actions";

export type EmailSettingsFormProps = {
  initialData: EmailSettingsInput;
  /** Which way emails actually leave right now. */
  activeTransport: "resend" | "none";
  /** The From line Resend will actually use, whatever its source. */
  effectiveFrom: string;
  resendConfigured: boolean;
  updatedAtText: string | null;
  updatedByEmail: string | null;
  /** Prefill for „изпрати тестов имейл" — whoever is looking at the screen. */
  testEmailDefault: string;
  canEdit: boolean;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm font-medium text-[color:var(--brand-ink)] placeholder-[color:var(--brand-purple)]/40 transition-all focus:border-[color:var(--brand-magenta)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-magenta)]/30";
const labelClass = "block text-sm font-semibold text-[color:var(--brand-ink)]";
const helperClass = "mt-1 text-xs text-[color:var(--brand-purple)]/60";

export function EmailSettingsForm({
  initialData,
  activeTransport,
  effectiveFrom,
  resendConfigured,
  updatedAtText,
  updatedByEmail,
  testEmailDefault,
  canEdit,
}: EmailSettingsFormProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(testEmailDefault);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailSettingsInput>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: initialData,
    mode: "onChange",
  });

  const onSubmit = async (data: EmailSettingsInput) => {
    if (!canEdit) return;
    setSubmitError(null);
    setToast(null);
    setTestResult(null);
    const result = await updateEmailSettingsAction(data);
    if (result.ok) {
      setToast(result.message);
      router.refresh();
      setTimeout(() => setToast(null), 4000);
    } else {
      setSubmitError(result.message);
    }
  };

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    const r = await sendTestEmailAction({ to: testTo });
    setTestResult({ ok: r.ok, message: r.message });
    setTesting(false);
  }

  return (
    <div className="space-y-6">
      {/* ─── Where mail goes ──────────────────────────────────────────── */}
      <div className="rounded-xl bg-[color:var(--brand-pink-soft)]/50 px-4 py-3 text-xs leading-relaxed text-[color:var(--brand-purple)]/80">
        <p>
          Всички наши имейли — потвърждения, напомняния към клиентите и към
          треньорите, известия за резервации и плащания към екипа — излизат през{" "}
          <strong className="text-[color:var(--brand-magenta)]">Resend</strong>.
        </p>
        <p className="mt-1.5">
          Изпращач в момента:{" "}
          <strong className="text-[color:var(--brand-ink)]">
            {effectiveFrom}
          </strong>
          .
        </p>
        <p className="mt-1.5">
          Кодовете за вход също минават през Resend, но се изпращат от Supabase
          Auth с неговите настройки. Нищо на този екран не може да спре влизането
          на клиент.
        </p>
        {updatedAtText && (
          <p className="mt-1.5 text-[color:var(--brand-purple)]/60">
            Последна промяна: {updatedAtText}
            {updatedByEmail ? ` · ${updatedByEmail}` : ""}
          </p>
        )}
      </div>

      {activeTransport === "none" && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">
          На сървъра липсва <code>RESEND_API_KEY</code>. Докато е така, нашите
          имейли не се изпращат — добави променливата и рестартирай
          приложението.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Име на изпращача</label>
            <Controller
              name="fromName"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  value={field.value ?? ""}
                  type="text"
                  placeholder="FitLab Varna"
                  className={inputClass}
                  disabled={isSubmitting || !canEdit}
                />
              )}
            />
          </div>
          <div>
            <label className={labelClass}>Имейл на изпращача</label>
            <Controller
              name="fromEmail"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  value={field.value ?? ""}
                  type="email"
                  placeholder="info@fitlabvarna.com"
                  className={inputClass}
                  disabled={isSubmitting || !canEdit}
                />
              )}
            />
            {errors.fromEmail && (
              <p className="mt-1 text-xs text-red-600">
                {errors.fromEmail.message}
              </p>
            )}
          </div>
        </div>
        <p className={helperClass}>
          Домейнът на този адрес трябва да е потвърден в Resend, иначе писмата
          се отказват. Празно поле = използва се адресът от{" "}
          <code>RESEND_FROM</code> на сървъра.
        </p>

        <div>
          <label className={labelClass}>Отговор до (reply-to)</label>
          <p className={helperClass}>
            Незадължително. Ако е празно, отговорите отиват на имейла на
            изпращача.
          </p>
          <Controller
            name="replyTo"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="email"
                placeholder="info@fitlabvarna.com"
                className={inputClass}
                disabled={isSubmitting || !canEdit}
              />
            )}
          />
          {errors.replyTo && (
            <p className="mt-1 text-xs text-red-600">{errors.replyTo.message}</p>
          )}
        </div>

        {submitError && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !canEdit}
          className="w-full rounded-2xl bg-[color:var(--brand-magenta)] px-5 py-3 font-display font-semibold text-white shadow-[0_4px_16px_-8px_rgba(236,72,153,0.28)] transition-all hover:opacity-95 disabled:opacity-50"
        >
          {isSubmitting ? "Запазване..." : "Запази настройките за имейли"}
        </button>
      </form>

      {/* ─── Test send ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-[color:var(--brand-purple)]/20 px-4 py-4">
        <p className={labelClass}>Изпрати тестов имейл</p>
        <p className={helperClass}>
          Праща се през Resend с изпращача, който е запазен — така се вижда
          веднага, ако адресът не е потвърден.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="твоят@имейл.bg"
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
            disabled={testing || !canEdit || !resendConfigured}
          />
          <button
            type="button"
            onClick={runTest}
            disabled={
              testing || !canEdit || !resendConfigured || testTo.trim() === ""
            }
            className="shrink-0 rounded-lg border border-[color:var(--brand-magenta)]/40 px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)] disabled:opacity-50"
          >
            {testing ? "…" : "Изпрати"}
          </button>
        </div>
        {testResult && (
          <p
            role="status"
            className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
              testResult.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {testResult.message}
          </p>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-lg bg-[color:var(--brand-pink-soft)]/60 px-4 py-3 text-xs text-[color:var(--brand-purple)]/80">
          Само super admin може да променя системните настройки.
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[color:var(--brand-purple)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
