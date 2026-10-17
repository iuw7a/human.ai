import { createAdminSupabase } from "./supabase/server";
import { sessionUser } from "./bots";
import { getEffectiveSubscription, type EffectiveSubscription } from "./subscriptions";
import { normalizeScopes, scopeLabel, type ApiKeyScope } from "./apiKeys";

/**
 * Server-side data helpers for the developer dashboard (/platform/dash).
 * White-label rule: raw provider/gateway identifiers never leave this module —
 * tables show neutral model names and friendly error texts only.
 */

export type DashUser = {
  id: string;
  email: string;
  createdAt: string | null;
  subscription: EffectiveSubscription;
};

export async function getDashUser(): Promise<DashUser | null> {
  const user = await sessionUser();
  if (!user) return null;
  const subscription = await getEffectiveSubscription(user.id);
  return {
    id: user.id,
    email: user.email ?? "",
    createdAt: (user as { created_at?: string }).created_at ?? null,
    subscription,
  };
}

export type DashKey = {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  scopes: ApiKeyScope[];
  scope_label: string;
};

const KEY_COLS = "id,name,prefix,enabled,usage_count,last_used_at,created_at";

export async function getMyKeys(userId: string): Promise<DashKey[]> {
  const admin = createAdminSupabase();
  const withScopes = await admin
    .from("api_keys")
    .select(`${KEY_COLS},scopes`)
    .eq("user_id", userId)
    .like("name", "Human AI API:%")
    .order("created_at", { ascending: false })
    .limit(50);

  let data: unknown[] | null = (withScopes.data ?? null) as unknown[] | null;
  let error: unknown = withScopes.error;
  if (error) {
    // supabase/api_key_scopes.sql not run yet — keys work without scopes.
    const legacy = await admin
      .from("api_keys")
      .select(KEY_COLS)
      .eq("user_id", userId)
      .like("name", "Human AI API:%")
      .order("created_at", { ascending: false })
      .limit(50);
    data = (legacy.data ?? null) as unknown[] | null;
    error = legacy.error;
  }
  if (error) return [];

  const rows = (data ?? []) as (Omit<DashKey, "scopes" | "scope_label"> & { scopes?: unknown })[];
  return rows.map((k) => {
    const scopes = normalizeScopes(k.scopes);
    return { ...k, scopes, scope_label: scopeLabel(scopes) } as DashKey;
  });
}

export type UsageLog = {
  model_slug: string;
  total_tokens: number;
  success: boolean;
  error: string;
  source: string;
  created_at: string;
};

export type UsageBreakdown = { key: string; requests: number; tokens: number };

export type UsageSummary = {
  rows: UsageLog[];
  totalRequests: number;
  totalTokens: number;
  failed: number;
  byModel: UsageBreakdown[];
  bySource: UsageBreakdown[];
  byDay: { day: string; tokens: number; requests: number }[];
  days: number;
};

const USAGE_COLS = "model_slug,total_tokens,success,error,created_at,source";

export async function getMyUsage(userId: string, days = 30): Promise<UsageSummary> {
  const admin = createAdminSupabase();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const run = (cols: string) =>
    admin
      .from("model_usage_logs")
      .select(cols)
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

  let res = await run(USAGE_COLS);
  if (res.error) {
    // supabase/usage_source.sql not run yet.
    res = await run("model_slug,total_tokens,success,error,created_at");
  }

  const rows: UsageLog[] = ((res.data ?? []) as unknown as Partial<UsageLog>[]).map((r) => ({
    model_slug: r.model_slug ?? "",
    total_tokens: r.total_tokens ?? 0,
    success: r.success !== false,
    error: r.error ?? "",
    source: r.source ?? "unknown",
    created_at: r.created_at ?? "",
  }));

  const byModel = new Map<string, UsageBreakdown>();
  const bySource = new Map<string, UsageBreakdown>();
  const byDay = new Map<string, { tokens: number; requests: number }>();
  let totalTokens = 0;
  let failed = 0;

  for (const r of rows) {
    totalTokens += r.total_tokens;
    if (!r.success) failed++;
    const m = byModel.get(r.model_slug) ?? { key: r.model_slug, requests: 0, tokens: 0 };
    m.requests++;
    m.tokens += r.total_tokens;
    byModel.set(r.model_slug, m);
    const s = bySource.get(r.source) ?? { key: r.source, requests: 0, tokens: 0 };
    s.requests++;
    s.tokens += r.total_tokens;
    bySource.set(r.source, s);
    const day = r.created_at.slice(0, 10);
    if (day) {
      const d = byDay.get(day) ?? { tokens: 0, requests: 0 };
      d.tokens += r.total_tokens;
      d.requests++;
      byDay.set(day, d);
    }
  }

  return {
    rows,
    days,
    totalRequests: rows.length,
    totalTokens,
    failed,
    byModel: [...byModel.values()].sort((a, b) => b.tokens - a.tokens),
    bySource: [...bySource.values()].sort((a, b) => b.tokens - a.tokens),
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, 14),
  };
}

const SOURCE_LABELS: Record<string, string> = {
  chat: "Chat",
  api_key: "API",
  admin: "Intern",
  unknown: "Ohne Zuordnung",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? "Ohne Zuordnung";
}

/**
 * Never surface raw provider errors — they contain vendor names.
 * Everything the user sees is a short, neutral German reason.
 */
export function friendlyError(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/429|rate.?limit|too many/i.test(s)) return "Zu viele Anfragen (Rate-Limit)";
  if (/402|payment|insufficient|balance|credit|quota|top.?up|wallet/i.test(s)) return "Kontingent aufgebraucht";
  if (/timeout|aborted|ECONN|fetch failed|EAI_AGAIN/i.test(s)) return "Zeitüberschreitung";
  if (/401|403|unauthor|forbidden|invalid key/i.test(s)) return "Zugriff verweigert";
  if (/5\d\d|server error|unavailable/i.test(s)) return "Kurzer Serverfehler";
  if (/content|safety|moderation|blocked/i.test(s)) return "Anfrage abgelehnt";
  return "Unbekannter Fehler";
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("de-DE");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
