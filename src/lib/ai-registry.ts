import { listDbModels, type DbModel } from "./admin";
import { getEffectiveSubscription, canAccessModel, type EffectiveSubscription } from "./subscriptions";
import { listGatewaysMasked, probeGateway } from "./gateways";

/**
 * Centralized server-side AI provider/model registry.
 * Reuses the existing NVIDIA + Groq integrations — no duplicate clients,
 * no invented providers/models. Keys stay server-side, never exposed.
 */

export interface ProviderInfo {
  key: string;
  label: string;
  configured: boolean;
  baseUrl: string;
  /** Live connectivity (checked server-side, no secrets leaked). */
  reachable: boolean | null;
  detail: string;
  modelCount: number;
}

export interface RegistryModel extends DbModel {
  /** Which plans may use it (derived from plan + access_level). */
  allowedPlans: string[];
}

function baseUrlFor(key: "nvidia" | "groq" | "ifm" | "agnes"): string {
  if (key === "groq") return process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
  if (key === "ifm") return process.env.IFM_BASE_URL ?? "https://api.ifm.ai/v1";
  if (key === "agnes") return process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com/v1";
  return process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
}

function keyConfigured(key: "nvidia" | "groq" | "ifm" | "agnes"): boolean {
  if (key === "groq") return !!process.env.GROQ_API_KEY;
  if (key === "ifm") return !!process.env.IFM_API_KEY;
  if (key === "agnes") return !!process.env.AGNES_API_KEY;
  return !!process.env.NVIDIA_API_KEY;
}

async function probeProvider(key: "nvidia" | "groq" | "ifm" | "agnes"): Promise<{ reachable: boolean | null; detail: string }> {
  if (key === "agnes") {
    return process.env.AGNES_API_KEY
      ? { reachable: null, detail: "key set, image generation" }
      : { reachable: false, detail: "AGNES_API_KEY not configured" };
  }
  const apiKey =
    key === "groq" ? process.env.GROQ_API_KEY
    : key === "ifm" ? process.env.IFM_API_KEY
    : process.env.NVIDIA_API_KEY;
  if (!apiKey) return { reachable: false, detail: "API key not configured" };
  try {
    const res = await fetch(`${baseUrlFor(key)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) return { reachable: true, detail: "reachable" };
    const text = await res.text().catch(() => "");
    if (res.status === 404) return { reachable: null, detail: "key set, /models endpoint not supported" };
    return { reachable: false, detail: `HTTP ${res.status} ${text.slice(0, 120)}`.trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unreachable";
    if (/timeout|aborted/i.test(msg)) return { reachable: false, detail: "timeout after 12s" };
    return { reachable: false, detail: msg.slice(0, 200) };
  }
}

export async function listProviders(checkLive = false): Promise<ProviderInfo[]> {
  const models = await listDbModels().catch(() => []);
  const out: ProviderInfo[] = [];
  for (const key of ["nvidia", "groq", "ifm", "agnes"] as const) {
    let reachable: boolean | null = null;
    let detail = keyConfigured(key) ? "key configured" : "API key not configured";
    if (checkLive) {
      const p = await probeProvider(key);
      reachable = p.reachable;
      detail = p.detail;
    }
    out.push({
      key,
      label: key === "nvidia" ? "NVIDIA" : key === "groq" ? "Groq" : key === "agnes" ? "Agnes" : "IFM",
      configured: keyConfigured(key),
      baseUrl: baseUrlFor(key),
      reachable,
      detail,
      modelCount: models.filter((m) => m.provider === key).length,
    });
  }
  // DB gateways (kira / codecraft / bynara + custom). Keys never leave the server.
  try {
    const gws = await listGatewaysMasked();
    const { createAdminSupabase } = await import("./supabase/server");
    const admin = createAdminSupabase();
    const { data: secrets } = await admin.from("provider_gateways").select("key,base_url,api_key,enabled");
    const secMap = new Map(((secrets ?? []) as { key: string; base_url: string; api_key: string; enabled: boolean }[]).map((s) => [s.key, s]));
    for (const g of gws) {
      const s = secMap.get(g.key);
      let reachable: boolean | null = null;
      let detail = g.has_key ? "key set" : "no key";
      let modelCount = models.filter((m) => (m.provider as string) === g.key).length;
      if (checkLive && s?.api_key) {
        const p = await probeGateway(g.key, s.base_url, s.api_key);
        reachable = p.reachable;
        detail = p.detail;
        if (typeof p.modelCount === "number") modelCount = Math.max(modelCount, 0);
      }
      out.push({
        key: g.key,
        label: g.label,
        configured: !!s?.api_key,
        baseUrl: g.base_url,
        reachable,
        detail,
        modelCount,
      });
    }
  } catch {
    // gateways table missing -> built-ins only
  }
  return out;
}

function allowedPlansFor(m: DbModel): string[] {
  // min plan + access tier -> which product plans may use it.
  // free: light only; plus: light+pro; pro: all.
  if (m.access_level === "extra" || m.access_level === "high") return ["pro"];
  if (m.access_level === "pro" || m.plan === "plus") return ["plus", "pro"];
  if (m.plan === "pro") return ["pro"];
  return ["free", "plus", "pro"];
}

export async function listRegistryModels(): Promise<RegistryModel[]> {
  const models = await listDbModels();
  return models.map((m) => ({ ...m, allowedPlans: allowedPlansFor(m) }));
}

/** Models the given subscription may actually use (enabled + entitled). */
export async function allowedModelsFor(sub: EffectiveSubscription): Promise<RegistryModel[]> {
  const all = await listRegistryModels();
  return all.filter((m) => m.enabled && canAccessModel(sub, m));
}

/**
 * Permitted fallback when an authorized model is unavailable (5xx, 404,
 * timeout, no entitlement). Returns the default model if the user may use
 * it, else the first allowed model, else null. Never upgrades silently.
 */
export async function permittedFallback(
  sub: EffectiveSubscription,
  failedSlug?: string
): Promise<RegistryModel | null> {
  const allowed = await allowedModelsFor(sub);
  if (allowed.length === 0) return null;
  const def = allowed.find((m) => m.is_default);
  if (def && def.id !== failedSlug) return def;
  return allowed.find((m) => m.id !== failedSlug) ?? null;
}

/** Human-friendly provider error mapping (no secrets, no internals). */
export function friendlyProviderError(raw: string): string {
  if (/429|rate.?limit|too many requests/i.test(raw))
    return "The AI provider is rate-limited right now (free-tier per-minute limit). Wait ~30 seconds and try again — the server already retried once automatically.";
  if (/402|payment_required|insufficient|top\s?up|balance|credit|fund|wallet|quota/i.test(raw))
    return "This model needs gateway credit — the provider balance is empty. An administrator can top up in /admin → API Lab (see the red “needs top-up” badge).";
  if (/API error 401|unauthorized|invalid.*key/i.test(raw))
    return "The AI provider rejected the server credentials. An administrator must check the provider key.";
  if (/API error 40[34]|not.?found|no longer available|end of life|does not exist/i.test(raw))
    return "This AI model is unavailable on its provider. An administrator can point it at a live model in /admin → Models.";
  if (/API error 5\d\d|overloaded|inference-connection/i.test(raw))
    return "The AI servers are temporarily overloaded. Wait a few seconds and send your message again.";
  if (/timeout|aborted|abort|TimeoutError/i.test(raw))
    return "The AI provider timed out. Try again; if it persists an administrator must check credits/entitlement.";
  return raw.slice(0, 500);
}
