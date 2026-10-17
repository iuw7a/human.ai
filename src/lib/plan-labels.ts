/**
 * Plan catalog — the single source of truth for subscription plan keys.
 *
 * This module has NO server dependencies, so it is safe to import from client
 * components (badges, admin dropdowns, ...). Server-side helpers live in
 * `subscriptions.ts` (entitlements, effective subscription) which re-exports
 * everything here.
 *
 * Order matters: `PLANS` is the ascending rank (higher = more access).
 * Legacy `plus`/`pro` stay valid so existing rows and seeded models keep working.
 */

export const PLANS = [
  "free",
  "plus",
  "pro",
  "humi_elite",
  "humi_pro",
  "humi_extra",
  "humi_enterprises",
] as const;

export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  humi_elite: "Humi Elite",
  humi_pro: "Humi Pro",
  humi_extra: "Humi Extra",
  humi_enterprises: "Humi Enterprises",
};

/** Plans that can be bought, cheapest → priciest. "free" is never sold. */
export const PAID_PLANS = ["humi_elite", "humi_pro", "humi_extra", "humi_enterprises"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** Ascending rank; higher = more access. */
export const PLAN_RANK: Record<Plan, number> = Object.fromEntries(
  PLANS.map((plan, index) => [plan, index])
) as Record<Plan, number>;

export function isPlan(v: unknown): v is Plan {
  return (PLANS as readonly string[]).includes(v as string);
}

export function normalizePlan(v: unknown): Plan {
  return isPlan(v) ? v : "free";
}

export function isPaidPlan(v: unknown): v is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(v as string);
}

/** Display name for any plan value (unknown → "Free"). */
export function planLabel(v: unknown): string {
  return PLAN_LABELS[normalizePlan(v)];
}
