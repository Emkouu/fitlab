import { Resend } from "resend";

// Lazy singleton. Resend's constructor throws if RESEND_API_KEY is missing,
// which would break `next build` page-data collection (env not set in CI).
// sendReminder() guards on the key being present before calling getResend().
let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
