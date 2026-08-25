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
  /** Whether a password is already stored — the value itself never leaves the server. */
  hasPassword: boolean;
  /** What is still missing before the saved SMTP can be used. */
  gaps: string[];
  /** Whether SMTP is switched on in the SAVED row — what the warning is about. */
  savedEnabled: boolean;
  /** Which way emails actually leave right now. */
  activeTransport: "smtp" | "resend" | "none";
  /** SETTINGS_ENCRYPTION_KEY present on the server — without it no password can be saved. */
  encryptionKeyPresent: boolean;
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

const TRANSPORT_LABEL: Record<EmailSettingsFormProps["activeTransport"], string> = {
  smtp: "нашият SMTP",
  resend: "Resend",
  none: "никъде — имейлите не се изпращат",
};

export function EmailSettingsForm({
  initialData,
  hasPassword,
  gaps,
  savedEnabled,
  activeTransport,
  encryptionKeyPresent,
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
      {/* ─── Where mail goes right now ────────────────────────────────── */}
      <div className="rounded-xl bg-[color:var(--brand-pink-soft)]/50 px-4 py-3 text-xs leading-relaxed text-[color:var(--brand-purple)]/80">
        <p>
          Нашите имейли (потвърждения, напомняния, известия към екипа) излизат
          в момента през:{" "}
          <strong className="text-[color:var(--brand-magenta)]">
            {TRANSPORT_LABEL[activeTransport]}
          </strong>
          .
        </p>
        <p className="mt-1.5">
          Кодовете за вход <strong>не</strong> минават оттук — те се изпращат от
          Supabase Auth със собствените си настройки. Промяна на това поле не
          може да спре влизането на клиент.
        </p>
        {updatedAtText && (
          <p className="mt-1.5 text-[color:var(--brand-purple)]/60">
            Последна промяна: {updatedAtText}
            {updatedByEmail ? ` · ${updatedByEmail}` : ""}
          </p>
        )}
      </div>

      {savedEnabled && gaps.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          SMTP е включен, но липсва: {gaps.join(", ")}. Докато е така, имейлите
          излизат през {resendConfigured ? "Resend" : "никъде"}.
        </p>
      )}

      {!encryptionKeyPresent && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">
          На сървъра липсва <code>SETTINGS_ENCRYPTION_KEY</code>. Без него
          паролата не може да бъде запазена шифрована — задай променливата във
          Vercel и презареди.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Controller
          name="smtpEnabled"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className={labelClass}>Изпращай през наш SMTP</span>
                <span className={helperClass}>
                  Когато е изключено, имейлите излизат през Resend. Ако SMTP
                  сървърът откаже, писмото се праща през Resend, а грешката влиза
                  в лога.
                </span>
              </span>
              <span className="relative mt-1 inline-flex shrink-0">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={isSubmitting || !canEdit}
                  className="peer sr-only"
                />
                <span className="h-6 w-11 rounded-full bg-[color:var(--brand-purple)]/20 transition-colors peer-checked:bg-[color:var(--brand-magenta)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--brand-magenta)]/40" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
          )}
        />
        {errors.smtpEnabled && (
          <p className="text-xs text-red-600">{errors.smtpEnabled.message}</p>
        )}

        <div>
          <label className={labelClass}>SMTP хост</label>
          <Controller
            name="smtpHost"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="text"
                placeholder="smtp.fitlabvarna.com"
                autoComplete="off"
                className={inputClass}
                disabled={isSubmitting || !canEdit}
              />
            )}
          />
          {errors.smtpHost && (
            <p className="mt-1 text-xs text-red-600">{errors.smtpHost.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Порт</label>
            <Controller
              name="smtpPort"
              control={control}
              render={({ field }) => (
                <input
                  type="number"
                  min={1}
                  max={65535}
                  step={1}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === "" ? null : e.target.valueAsNumber,
                    )
                  }
                  placeholder="465"
                  className={inputClass}
                  disabled={isSubmitting || !canEdit}
                />
              )}
            />
            {errors.smtpPort && (
              <p className="mt-1 text-xs text-red-600">{errors.smtpPort.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Криптиране</label>
            <Controller
              name="smtpSecure"
              control={control}
              render={({ field }) => (
                <select
                  value={field.value ? "ssl" : "starttls"}
                  onChange={(e) => field.onChange(e.target.value === "ssl")}
                  className={inputClass}
                  disabled={isSubmitting || !canEdit}
                >
                  <option value="ssl">SSL/TLS (465)</option>
                  <option value="starttls">STARTTLS (587)</option>
                </select>
              )}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Потребител</label>
          <Controller
            name="smtpUser"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="text"
                placeholder="info@fitlabvarna.com"
                autoComplete="off"
                className={inputClass}
                disabled={isSubmitting || !canEdit}
              />
            )}
          />
          {errors.smtpUser && (
            <p className="mt-1 text-xs text-red-600">{errors.smtpUser.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Парола</label>
          <p className={helperClass}>
            {hasPassword
              ? "Паролата е запазена и шифрована. Остави полето празно, за да я запазиш; въведи нова, за да я замениш."
              : "Съхранява се шифрована и никога не се показва обратно."}
          </p>
          <Controller
            name="smtpPassword"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ""}
                type="password"
                autoComplete="new-password"
                placeholder={hasPassword ? "•••••••• (запазена)" : ""}
                className={inputClass}
                disabled={isSubmitting || !canEdit}
              />
            )}
          />
          {errors.smtpPassword && (
            <p className="mt-1 text-xs text-red-600">
              {errors.smtpPassword.message}
            </p>
          )}
        </div>

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
          Праща се точно по начина, който е запазен, без резервен вариант — за да
          се види истинската грешка, ако SMTP не работи.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="твоят@имейл.bg"
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--brand-purple)]/20 px-3 py-2.5 text-sm focus:border-[color:var(--brand-magenta)] focus:outline-none"
            disabled={testing || !canEdit}
          />
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !canEdit || testTo.trim() === ""}
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
