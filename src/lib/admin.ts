import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "./supabase/server";
import type { ModelConfig } from "./models";
import { models as codeModels, DEFAULT_MODEL_ID } from "./models";

export const ADMIN_ROLES = ["admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  plan: string;
  name: string;
}

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === "admin" || role === "super_admin";
}

/** Server-side admin gate. Returns the admin or redirects/throws. */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,plan,name,status")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdminRole(profile.role) || profile.status !== "active") {
    redirect("/admin/denied");
  }
  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role,
    plan: profile.plan ?? "free",
    name: profile.name ?? user.email ?? "Admin",
  };
}

/** Non-redirecting variant for API routes (returns null instead). */
export async function getAdmin(): Promise<AdminUser | null> {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = createAdminSupabase();
    const { data: profile } = await admin
      .from("profiles")
      .select("role,plan,name,status")
      .eq("id", user.id)
      .single();
    if (!profile || !isAdminRole(profile.role) || profile.status !== "active") {
      return null;
    }
    return {
      id: user.id,
      email: user.email ?? "",
      role: profile.role,
      plan: profile.plan ?? "free",
      name: profile.name ?? user.email ?? "Admin",
    };
  } catch {
    return null;
  }
}

export async function logAdminAction(
  adminId: string,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>
) {
  try {
    const admin = createAdminSupabase();
    await admin.from("audit_logs").insert({
      admin_id: adminId,
      action,
      target: target ?? null,
      metadata: metadata ?? {},
    });
  } catch {
    // audit must never break the action itself
  }
}

export async function logAppError(
  source: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    const admin = createAdminSupabase();
    await admin.from("app_errors").insert({
      source,
      message: message.slice(0, 2000),
      metadata: metadata ?? {},
    });
  } catch {
    // ignore
  }
}

/** Feature flag check (server-side). Defaults to enabled on DB error. */
export async function isEnabled(key: string): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .single();
    return data ? !!data.enabled : true;
  } catch {
    return true;
  }
}

/** Maintenance state (server-side). */
export async function maintenanceState(): Promise<{ on: boolean; message: string }> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("app_settings")
      .select("key,value")
      .in("key", ["maintenance", "maintenance_message"]);
    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    return {
      on: map.maintenance === "on",
      message:
        map.maintenance_message ||
        "Human AI is briefly down for maintenance. Please check back soon.",
    };
  } catch {
    return { on: false, message: "" };
  }
}

export interface DbModel extends ModelConfig {
  enabled: boolean;
  plan: "free" | "plus" | "pro";
  /** AI capability tier: light (free), pro, high, extra (pro-only). */
  access_level: "light" | "pro" | "high" | "extra";
  sort: number;
  is_default: boolean;
}

function normalizeModelPlan(v: unknown): DbModel["plan"] {
  return v === "plus" || v === "pro" ? v : "free";
}

function normalizeAccessLevel(v: unknown): DbModel["access_level"] {
  return v === "pro" || v === "high" || v === "extra" ? v : "light";
}

/** DB-backed model registry (falls back to code registry if table missing). */
export async function listDbModels(): Promise<DbModel[]> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("admin_models")
      .select("*")
      .order("sort", { ascending: true });
    if (error || !data || data.length === 0) throw new Error("fallback");
    return data.map((m) => ({
      id: m.slug,
      provider: (m.provider === "groq" ? "groq" : m.provider === "ifm" ? "ifm" : "nvidia") as
        | "nvidia"
        | "groq"
        | "ifm",
      name: m.name,
      description: "",
      providerModelId: m.provider_model_id,
      vision: !!m.vision,
      streaming: true,
      maxImageSizeMB: 8,
      enabled: !!m.enabled,
      plan: normalizeModelPlan(m.plan),
      access_level: normalizeAccessLevel(
        (m as { access_level?: unknown }).access_level ??
          (m.plan === "plus" || m.plan === "pro" ? "pro" : "light")
      ),
      sort: m.sort ?? 0,
      is_default: !!m.is_default,
    }));
  } catch {
    return Object.values(codeModels).map((m, i) => ({
      ...m,
      enabled: true,
      plan: "free" as const,
      access_level: "light" as const,
      sort: i,
      is_default: m.id === DEFAULT_MODEL_ID,
    }));
  }
}

export async function resolveDbModel(slug: string): Promise<DbModel | null> {
  const all = await listDbModels();
  return all.find((m) => m.id === slug) ?? null;
}

export async function defaultDbModelSlug(): Promise<string> {
  const all = await listDbModels();
  return all.find((m) => m.is_default && m.enabled)?.id ?? DEFAULT_MODEL_ID;
}

const ANN_TTL_MS = 60_000;
let annCache: {
  at: number;
  rows: { id: string; title: string; message: string; image_url: string | null; link_url: string | null; audience: string; kind: string }[];
} | null = null;

/** Active announcements/notices for an audience (public, server-side). */
export async function activeAnnouncements(
  audience: "all" | "free" | "plus",
  kind?: "banner" | "modal" | "notice"
) {
  // Speed: announcements change rarely (admin-edited) but are fetched on EVERY
  // page via AppShell (3 queries: banner+modal+notice). One shared fetch with
  // a 60 s in-memory TTL replaces 3 sequential DB round-trips.
  const now = Date.now();
  if (!annCache || now - annCache.at > ANN_TTL_MS) {
    try {
      const admin = createAdminSupabase();
      const iso = new Date().toISOString();
      const { data } = await admin
        .from("announcements")
        .select("id,title,message,image_url,link_url,audience,kind")
        .eq("active", true)
        .or(`starts_at.is.null,starts_at.lte.${iso},ends_at.is.null,ends_at.gte.${iso}`)
        .order("created_at", { ascending: false })
        .limit(30);
      annCache = { at: now, rows: data ?? [] };
    } catch {
      return [];
    }
  }
  return (annCache.rows ?? []).filter(
    (a) => (!kind || a.kind === kind) && (a.audience === "all" || a.audience === audience)
  );
}
