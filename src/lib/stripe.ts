import Stripe from "stripe";
import { PAID_PLANS, isPaidPlan, type PaidPlan } from "./plan-labels";

/**
 * Server-only Stripe helpers. Never import this from a client component
 * (it pulls the `stripe` SDK and reads server-only env).
 *
 * The Stripe API version is deliberately NOT pinned — the SDK default is used.
 */

export { PAID_PLANS, isPaidPlan };
export type { PaidPlan };

let cached: Stripe | null = null;

/** Lazily create the Stripe client. Throws when the secret key is missing. */
export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!cached) cached = new Stripe(secret);
  return cached;
}

/** Env var holding the Stripe Price ID for each purchasable plan. */
const PRICE_ENV: Record<PaidPlan, string> = {
  humi_elite: "STRIPE_PRICE_HUMI_ELITE",
  humi_pro: "STRIPE_PRICE_HUMI_PRO",
  humi_extra: "STRIPE_PRICE_HUMI_EXTRA",
  humi_enterprises: "STRIPE_PRICE_HUMI_ENTERPRISES",
};

export function priceEnvName(plan: PaidPlan): string {
  return PRICE_ENV[plan];
}

/** Stripe Price ID configured for a paid plan (env), or null when not set up. */
export function priceIdForPlan(plan: PaidPlan): string | null {
  return process.env[PRICE_ENV[plan]]?.trim() || null;
}

/** Reverse lookup: which paid plan a Stripe Price ID belongs to. */
export function planForPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    if (priceIdForPlan(plan) === priceId) return plan;
  }
  return null;
}

/** App base URL used to build Checkout success/cancel URLs. */
export function appDomain(): string {
  return (process.env.DOMAIN ?? "").replace(/\/+$/, "") || "http://localhost:3000";
}
