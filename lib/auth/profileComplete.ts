/**
 * Is this profile usable — do we know who the person is and how to reach them?
 *
 * Name and phone are both collected in onboarding and both are required, but
 * onboarding used to be a suggestion: the redirect only fired straight after
 * the OTP, and only looked at `fullName`. Leave the page, come back, and you
 * were a registered client with no name and no phone — a booking staff could
 * see in Attendance but nobody could call.
 *
 * So completeness has one definition, here, and it is checked on the way in to
 * the site as well as in `bookClassAction` — not once at signup.
 */
export type ProfileIdentity = {
  fullName?: string | null;
  phone?: string | null;
};

export function isProfileComplete(profile: ProfileIdentity | null | undefined): boolean {
  if (!profile) return false;
  return (
    typeof profile.fullName === "string" &&
    profile.fullName.trim() !== "" &&
    typeof profile.phone === "string" &&
    profile.phone.trim() !== ""
  );
}

/** Where to send someone whose profile is still missing something. */
export function onboardingPathFor(next: string): string {
  return `/onboarding?next=${encodeURIComponent(next)}`;
}
