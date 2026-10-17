import { createAdminSupabase } from "./supabase/server";
import type { DbModel } from "./admin";

/**
 * Central subscription + AI access configuration.
 * Plans are the product tiers stored on profiles.plan.
 * Access levels are the AI capability tiers models belong to.
 * The DB table plan_access_rules overrides the defaults below.
 */

import { PLAN_RANK, normalizePlan } from "./plan-labels";
import type { Plan } from "./plan-labels";

export {
  PLANS,
  PLAN_LABELS,
  PAID_PLANS,
  PLAN_RANK,
  isPlan,
  isPaidPlan,
  planLabel,
  normalizePlan,
} from "./plan-labels";
export type { Plan, PaidPlan } from "./plan-labels";

export const SUBSCRIPTION_STATUSES = ["free", "active", "expired", "suspended"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_SOURCES = [
  "payment",
  "admin_grant",
  "redeem_code",
  "promotion",
  "external_provider",
] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

export const SOURCE_LABELS: Record<SubscriptionSource, string> = {
  payment: "Payment",
  admin_grant: "Admin Grant",
  redeem_code: "Redeem Code",
  promotion: "Promotion",
  external_provider: "External Provider",
};

export const ACCESS_LEVELS = ["light", "pro", "high", "extra"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  light: "Light",
  pro: "Pro",
  high: "High",
  extra: "Extra",
};

/** Default entitlements when plan_access_rules is missing. */
export const DEFAULT_ENTITLEMENTS: Record<Plan, AccessLevel[]> = {
  free: ["light"],
  plus: ["light", "pro"],
  pro: ["light", "pro", "high", "extra"],
  humi_elite: ["light", "pro"],
  humi_pro: ["light", "pro", "high"],
  humi_extra: ["light", "pro", "high", "extra"],
  humi_enterprises: ["light", "pro", "high", "extra"],
};

export function normalizeStatus(v: unknown): SubscriptionStatus {
  return v === "active" || v === "expired" || v === "suspended" ? (v as SubscriptionStatus) : "free";
}

export function normalizeSource(v: unknown): SubscriptionSource | null {
  return (SUBSCRIPTION_SOURCES as readonly string[]).includes(v as string)
    ? (v as SubscriptionSource)
    : null;
}

export function normalizeAccess(v: unknown): AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(v as string) ? (v as AccessLevel) : "light";
}

export interface EffectiveSubscription {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  source: SubscriptionSource | null;
  startsAt: string | null;
  expiresAt: string | null;
  providerRef: string | null;
  grantedBy: string | null;
  accessLevels: AccessLevel[];
  expired: boolean;
  suspended: boolean;
  /** Effective premium flag: active paid plan, not expired/suspended. */
  hasPremium: boolean;
}

export function freeSubscription(): EffectiveSubscription {
  return {
    plan: "free",
    subscriptionStatus: "free",
    source: null,
    startsAt: null,
    expiresAt: null,
    providerRef: null,
    grantedBy: null,
    accessLevels: [...DEFAULT_ENTITLEMENTS.free],
    expired: false,
    suspended: false,
    hasPremium: false,
  };
}

/** Admin-configurable plan -> access-level mapping (falls back to defaults). */
export async function getEntitlements(): Promise<Record<Plan, AccessLevel[]>> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("plan_access_rules").select("plan,access_levels");
    if (error || !data || data.length === 0) return { ...DEFAULT_ENTITLEMENTS };
    const out: Record<Plan, AccessLevel[]> = { ...DEFAULT_ENTITLEMENTS };
    for (const row of data) {
      const plan = normalizePlan((row as { plan: unknown }).plan);
      const raw = (row as { access_levels: unknown }).access_levels;
      const levels = Array.isArray(raw)
        ? (raw.filter((x) => (ACCESS_LEVELS as readonly string[]).includes(String(x))) as AccessLevel[])
        : [...DEFAULT_ENTITLEMENTS[plan]];
      out[plan] = levels.length > 0 ? levels : [...DEFAULT_ENTITLEMENTS[plan]];
    }
    return out;
  } catch {
    return { ...DEFAULT_ENTITLEMENTS };
  }
}

/**
 * Resolve the effective subscription for a user.
 * Expiry and suspension revoke premium immediately.
 * Never throws — returns free on any error.
 */
export async function getEffectiveSubscription(userId: string | null | undefined): Promise<EffectiveSubscription> {
  if (!userId) return freeSubscription();
  try {
    const admin = createAdminSupabase();
    // Full select (needs supabase/subscriptions_schema.sql). Falls back to
    // legacy plan-only rows when the migration has not been run yet, so
    // existing Plus users keep working before/during the rollout.
    let data: Record<string, unknown> | null = null;
    const full = await admin
      .from("profiles")
      .select(
        "plan,status,subscription_status,subscription_source,subscription_starts_at,subscription_expires_at,subscription_provider_ref,subscription_granted_by"
      )
      .eq("id", userId)
      .single();
    if (!full.error && full.data) {
      data = full.data as Record<string, unknown>;
    } else {
      const legacy = await admin.from("profiles").select("plan,status").eq("id", userId).single();
      if (legacy.error || !legacy.data) return freeSubscription();
      const lp = legacy.data as Record<string, unknown>;
      data = {
        plan: lp.plan,
        status: lp.status,
        subscription_status: lp.plan === "free" ? "free" : "active",
        subscription_source: null,
        subscription_starts_at: null,
        subscription_expires_at: null,
        subscription_provider_ref: null,
        subscription_granted_by: null,
      };
    }
    if (!data) return freeSubscription();

    // Banned/disabled accounts lose premium immediately.
    if (data.status === "banned" || data.status === "disabled") {
      return {
        ...freeSubscription(),
        subscriptionStatus: "suspended",
        suspended: true,
      };
    }

    const rawPlan = normalizePlan(data.plan);
    const subStatus = normalizeStatus(data.subscription_status);
    const source = normalizeSource(data.subscription_source);
    const expiresAt = (data.subscription_expires_at as string | null) ?? null;
    const expired =
      !!expiresAt && new Date(expiresAt).getTime() < Date.now() && rawPlan !== "free";
    const suspended = subStatus === "suspended";
    const statusExpired = subStatus === "expired" || expired;

    const entitlements = await getEntitlements();
    if (rawPlan === "free" || suspended || statusExpired) {
      return {
        plan: suspended || statusExpired ? rawPlan : "free",
        subscriptionStatus: suspended ? "suspended" : statusExpired ? "expired" : "free",
        source,
        startsAt: (data.subscription_starts_at as string | null) ?? null,
        expiresAt,
        providerRef: (data.subscription_provider_ref as string | null) ?? null,
        grantedBy: (data.subscription_granted_by as string | null) ?? null,
        accessLevels: [...DEFAULT_ENTITLEMENTS.free],
        expired: expired || subStatus === "expired",
        suspended,
        hasPremium: false,
      };
    }

    return {
      plan: rawPlan,
      subscriptionStatus: subStatus === "free" ? "active" : subStatus,
      source,
      startsAt: (data.subscription_starts_at as string | null) ?? null,
      expiresAt,
      providerRef: (data.subscription_provider_ref as string | null) ?? null,
      grantedBy: (data.subscription_granted_by as string | null) ?? null,
      accessLevels: [...(entitlements[rawPlan] ?? DEFAULT_ENTITLEMENTS[rawPlan])],
      expired: false,
      suspended: false,
      hasPremium: true,
    };
  } catch {
    return freeSubscription();
  }
}

/** Plan rank check (plus >= plus, pro >= plus, etc). */
export function planAtLeast(have: Plan, need: Plan): boolean {
  return PLAN_RANK[have] >= PLAN_RANK[need];
}

/**
 * Can this subscription use this model?
 * Both conditions must hold:
 *  - plan rank >= model min plan
 *  - accessLevels includes model access_level
 * Suspended/expired subscriptions only get light.
 */
export function canAccessModel(sub: EffectiveSubscription, model: Pick<DbModel, "plan" | "access_level">): boolean {
  const needPlan = normalizePlan((model as { plan: unknown }).plan);
  const needAccess = normalizeAccess((model as { access_level: unknown }).access_level);
  if (!sub.accessLevels.includes(needAccess)) return false;
  return planAtLeast(sub.plan, needPlan);
}

/** Upgrade message returned when access is denied (no model internals leaked). */
export function upgradeMessage(modelAccess: AccessLevel | string): string {
  const label = ACCESS_LABELS[normalizeAccess(modelAccess)] ?? "premium";
  return `This AI capability (${label}) requires an upgrade. Free chat keeps working — upgrade to Plus or Pro to unlock it.`;
}
