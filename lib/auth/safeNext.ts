/**
 * Sanitize a post-auth `next` redirect target.
 *
 * Only same-origin absolute paths are allowed. A naive `startsWith("/")` check
 * is NOT enough: protocol-relative URLs ("//evil.com") and backslash tricks
 * ("/\\evil.com", which browsers normalize to "//evil.com") also start with a
 * slash and would redirect the user off-site — an open-redirect / phishing
 * vector right after login. Reject anything that isn't a single-slash path.
 *
 * Shared by the client login form, the /api/auth/sync route, and the
 * onboarding page so all three enforce identical rules.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/schedule",
): string {
  if (!next || typeof next !== "string") return fallback;
  // Must start with exactly one forward slash.
  if (!next.startsWith("/")) return fallback;
  // Reject protocol-relative ("//host") and backslash-escaped ("/\host")
  // forms — both escape the current origin.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
