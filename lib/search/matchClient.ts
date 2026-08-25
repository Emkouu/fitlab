/**
 * Client-side matching for „търси по име / телефон / имейл" boxes.
 *
 * Pure and tested, because the phone part is the only non-obvious bit: staff
 * type a number the way the client says it („0888 12 34 56"), while the DB
 * holds E.164 („+359888123456"). So phones are compared as digits only, with
 * the Bulgarian trunk prefix folded — 0888… and +359888… are the same number.
 */

export type ClientSearchFields = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** Digits of a phone, with the BG country/trunk prefix normalised away. */
function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("359")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.replace(/^0+/, "");
  return digits;
}

/** True when the query looks like a phone fragment rather than a name. */
function isPhoneQuery(query: string): boolean {
  return /\d/.test(query) && /^[\d\s()+.-]+$/.test(query);
}

/**
 * Does this client match what was typed? An empty query matches everything,
 * so callers can pass the raw input straight through.
 */
export function matchesClientQuery(
  client: ClientSearchFields,
  query: string,
): boolean {
  const q = query.trim();
  if (q === "") return true;

  if (isPhoneQuery(q)) {
    const needle = phoneKey(q);
    // „+" or „()" alone carries no digits to compare — fall through to text.
    if (needle !== "" && client.phone) {
      return phoneKey(client.phone).includes(needle);
    }
  }

  const needle = q.toLowerCase();
  return [client.name, client.phone, client.email].some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}
