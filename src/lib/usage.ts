import { createAdminSupabase } from "./supabase/server";

export async function logModelUsage(input: {
  user_id?: string | null;
  model_slug: string;
  gateway_key?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  success?: boolean;
  error?: string;
  /** chat | api_key | admin — needs supabase/usage_source.sql, falls back gracefully. */
  source?: string;
}) {
  try {
    const admin = createAdminSupabase();
    const row: Record<string, unknown> = {
      user_id: input.user_id ?? null,
      model_slug: input.model_slug.slice(0, 120),
      gateway_key: (input.gateway_key ?? "").slice(0, 40),
      prompt_tokens: input.prompt_tokens ?? 0,
      completion_tokens: input.completion_tokens ?? 0,
      total_tokens: input.total_tokens ?? (input.prompt_tokens ?? 0) + (input.completion_tokens ?? 0),
      success: input.success !== false,
      error: (input.error ?? "").slice(0, 500),
      source: (input.source ?? "unknown").slice(0, 20),
    };
    const first = await admin.from("model_usage_logs").insert(row);
    if (first.error && /source/i.test(first.error.message)) {
      // Migration not run yet — log without source so nothing is lost.
      const { source: _drop, ...legacy } = row;
      void _drop;
      await admin.from("model_usage_logs").insert(legacy);
    }
  } catch {
    // usage must never break chat
  }
}

export interface BillingIssue {
  gateway_key: string;
  model_slug: string;
  error: string;
  created_at: string;
}

export interface BillingStatus {
  by_gateway: Record<string, { needs_topup: boolean; last_error: string; at: string; fail_count: number }>;
  failed_models: BillingIssue[];
}

const BILLING_RE = /402|payment_required|insufficient|top\s?up|balance|credit|fund|wallet|quota|usage.?limit|limit.?(reached|exceeded)|exceed/i;

/** Which gateways/models recently failed with billing (card/topup) errors. */
export async function getBillingStatus(days = 7): Promise<BillingStatus> {
  const by_gateway: BillingStatus["by_gateway"] = {};
  const failed_models: BillingIssue[] = [];
  try {
    const admin = createAdminSupabase();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await admin
      .from("model_usage_logs")
      .select("gateway_key,model_slug,error,created_at")
      .eq("success", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const r of ((data ?? []) as BillingIssue[])) {
      const msg = r.error ?? "";
      // Pure rate-limits (429 without payment words) are transient, not billing.
      if (!BILLING_RE.test(msg)) continue;
      if (/rate.?limit|too many|429/.test(msg) && !/402|payment|insufficient|top\s?up|balance|credit|wallet|quota|usage.?limit/i.test(msg)) continue;
      const gw = r.gateway_key || "internal";
      const cur = by_gateway[gw];
      if (!cur) {
        by_gateway[gw] = { needs_topup: true, last_error: r.error.slice(0, 300), at: r.created_at, fail_count: 1 };
      } else {
        cur.fail_count++;
      }
      if (!failed_models.some((f) => f.model_slug === r.model_slug)) {
        failed_models.push({ gateway_key: gw, model_slug: r.model_slug, error: r.error.slice(0, 300), created_at: r.created_at });
      }
    }
  } catch {
    // billing must never break admin
  }
  return { by_gateway, failed_models };
}

export interface GatewayQuota {
  key: string;
  label: string;
  limit: number;
  period: "daily" | "monthly" | "package";
  periodLabel: string;
  used: number;
  requests: number;
  /** For request-counted quotas (OpenRouter free). */
  requestLimit: number | null;
  requestsUsed: number;
}

export interface QuotaOverview {
  totalLimit: number;
  totalUsed: number;
  gateways: GatewayQuota[];
  bySource: { source: string; label: string; requests: number; tokens: number }[];
}

const KNOWN_QUOTAS: Record<string, { tokens: number; period: "daily" | "monthly"; periodLabel: string; requests?: number }> = {
  bynara: { tokens: 7_000_000, period: "daily", periodLabel: "يومي — يتجدد آخر اليوم" },
  codecraft: { tokens: 1_000_000, period: "monthly", periodLabel: "شهري — يتجدد أول الشهر" },
  openrouter: { tokens: 0, period: "daily", periodLabel: "يومي — يتجدد منتصف الليل", requests: 50 },
};

const SOURCE_LABELS: Record<string, string> = {
  chat: "الشات",
  api_key: "مفاتيح API",
  admin: "الأدمن",
  unknown: "قبل التتبع",
};

/** Combined quota pool: total line + per-gateway lines + chat-vs-API split. */
export async function getQuotaOverview(): Promise<QuotaOverview> {
  const admin = createAdminSupabase();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.now() - 30 * 86400000).toISOString();
  let gateways: { key: string; label: string; monthly_limit_tokens: number }[] = [];
  try {
    const { data } = await admin.from("provider_gateways").select("key,label,monthly_limit_tokens").order("key").limit(50);
    gateways = ((data ?? []) as typeof gateways) ?? [];
  } catch {
    gateways = [];
  }
  const [dayLogs, monthLogs] = await Promise.all([
    admin.from("model_usage_logs").select("gateway_key,total_tokens,source").gte("created_at", dayStart.toISOString()).limit(5000),
    admin.from("model_usage_logs").select("gateway_key,total_tokens,source").gte("created_at", monthStart).limit(5000),
  ]);
  const dayRows = ((dayLogs.data ?? []) as { gateway_key: string; total_tokens: number; source?: string }[]) ?? [];
  const monthRows = ((monthLogs.data ?? []) as { gateway_key: string; total_tokens: number; source?: string }[]) ?? [];

  const out: GatewayQuota[] = [];
  let totalLimit = 0;
  let totalUsed = 0;
  for (const g of gateways) {
    const known = KNOWN_QUOTAS[g.key];
    const limit = g.monthly_limit_tokens > 0 ? g.monthly_limit_tokens : (known?.tokens ?? 0);
    const period = g.monthly_limit_tokens > 0 ? "package" : (known?.period ?? "monthly");
    const periodLabel = g.monthly_limit_tokens > 0 ? "باقة — حسب ما حددت بالأدمن" : (known?.periodLabel ?? "بدون سقف معلن");
    const rows = period === "daily" ? dayRows : monthRows;
    const mine = rows.filter((r) => (r.gateway_key || "internal") === g.key);
    const used = mine.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    const requestsUsed = known?.requests ? dayRows.filter((r) => (r.gateway_key || "internal") === g.key).length : 0;
    if (limit > 0) {
      totalLimit += limit;
      totalUsed += used;
    }
    out.push({
      key: g.key, label: g.label, limit, period,
      periodLabel, used, requests: mine.length,
      requestLimit: known?.requests ?? null, requestsUsed,
    });
  }

  // Kira free-models daily pool (separate from the bonus package above).
  if (out.some((g) => g.key === "kira")) {
    const kiraToday = dayRows
      .filter((r) => (r.gateway_key || "internal") === "kira")
      .reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    out.push({
      key: "kira-free", label: "Kira — Free models", limit: 1_000_000, period: "daily",
      periodLabel: "يومي — يتجدد خلال ساعات", used: kiraToday, requests: 0,
      requestLimit: null, requestsUsed: 0,
    });
    totalLimit += 1_000_000;
    totalUsed += kiraToday;
  }

  const srcMap = new Map<string, { requests: number; tokens: number }>();
  for (const r of monthRows) {
    const s = (r as { source?: string }).source || "unknown";
    const cur = srcMap.get(s) ?? { requests: 0, tokens: 0 };
    cur.requests++;
    cur.tokens += r.total_tokens ?? 0;
    srcMap.set(s, cur);
  }
  const bySource = [...srcMap.entries()].map(([source, v]) => ({
    source, label: SOURCE_LABELS[source] ?? source, ...v,
  })).sort((a, b) => b.tokens - a.tokens);

  return { totalLimit, totalUsed, gateways: out, bySource };
}

export interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  by_model: { model_slug: string; requests: number; tokens: number }[];
  by_gateway: { gateway_key: string; requests: number; tokens: number; limit: number; remaining: number | null }[];
  recent: { model_slug: string; gateway_key: string; total_tokens: number; success: boolean; created_at: string }[];
}

export async function getUsageSummary(days = 30): Promise<UsageSummary> {
  const admin = createAdminSupabase();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: logs } = await admin
    .from("model_usage_logs")
    .select("model_slug,gateway_key,total_tokens,success,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (logs ?? []) as { model_slug: string; gateway_key: string; total_tokens: number; success: boolean; created_at: string }[];
  const byModel = new Map<string, { requests: number; tokens: number }>();
  const byGw = new Map<string, { requests: number; tokens: number }>();
  let totalTokens = 0;
  for (const r of rows) {
    totalTokens += r.total_tokens ?? 0;
    const m = byModel.get(r.model_slug) ?? { requests: 0, tokens: 0 };
    m.requests++;
    m.tokens += r.total_tokens ?? 0;
    byModel.set(r.model_slug, m);
    const g = byGw.get(r.gateway_key || "internal") ?? { requests: 0, tokens: 0 };
    g.requests++;
    g.tokens += r.total_tokens ?? 0;
    byGw.set(r.gateway_key || "internal", g);
  }

  const { data: gateways } = await admin.from("provider_gateways").select("key,monthly_limit_tokens");
  const limits = new Map(((gateways ?? []) as { key: string; monthly_limit_tokens: number }[]).map((g) => [g.key, g.monthly_limit_tokens ?? 0]));

  return {
    total_requests: rows.length,
    total_tokens: totalTokens,
    by_model: [...byModel.entries()]
      .map(([model_slug, v]) => ({ model_slug, ...v }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 50),
    by_gateway: [...byGw.entries()].map(([gateway_key, v]) => {
      const limit = limits.get(gateway_key) ?? 0;
      return { gateway_key, ...v, limit, remaining: limit > 0 ? Math.max(0, limit - v.tokens) : null };
    }),
    recent: rows.slice(0, 50),
  };
}
