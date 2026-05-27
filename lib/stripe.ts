import Stripe from "stripe";

/**
 * Singleton Stripe client. Hard-fails at module load if the secret is missing
 * or looks like a production key — MVP is test-mode only by policy. Any code
 * that imports this file is server-side (Node) by virtue of the secret never
 * being prefixed NEXT_PUBLIC_.
 */
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Copy your sk_test_… into .env from " +
      "Stripe Dashboard → Developers → API keys (Test mode).",
  );
}
if (!key.startsWith("sk_test_")) {
  throw new Error(
    `STRIPE_SECRET_KEY does not start with sk_test_ (${key.slice(0, 7)}…). ` +
      "MVP is test mode only; refusing to load a live key.",
  );
}

export const stripe = new Stripe(key);
