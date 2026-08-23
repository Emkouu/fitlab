/**
 * The studio this deployment serves.
 *
 * Multi-location is Phase 2, but „there is only one studio row" turned out to
 * be false in practice: the booking-engine tests upsert their own studio into
 * whatever database they run against. Anything that resolved the studio with a
 * bare `findFirst()` could therefore pick up the test row — which is exactly
 * how the desk's „+ Депозит" button started recording €20 instead of €10.
 *
 * So the studio is always resolved by this slug, never by „the first one".
 */
export const STUDIO_SLUG = "fitlab-varna";
