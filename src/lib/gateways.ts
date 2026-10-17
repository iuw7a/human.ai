import { createAdminSupabase } from "./supabase/server";

export interface Gateway {
  key: string;
  label: string;
  base_url: string;
  enabled: boolean;
  monthly_limit_tokens: number;
  has_key: boolean;
  created_at?: string;
}

export interface GatewayWithStatus extends Gateway {
  masked: string;
  reachable: boolean | null;
  detail: string;
  modelCount: number | null;
}

function mask(key: string) {
  if (!key) return "no key";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** List gateways with masked keys (safe for admin UI). */
export async function listGatewaysMasked(): Promise<GatewayWithStatus[]> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("provider_gateways")
      .select("key,label,base_url,api_key,enabled,monthly_limit_tokens,created_at")
      .order("key")
      .limit(100);
    return (data ?? []).map((g) => ({
      key: g.key,
      label: g.label,
      base_url: g.base_url,
      enabled: !!g.enabled,
      monthly_limit_tokens: g.monthly_limit_tokens ?? 0,
      has_key: !!(g.api_key as string),
      masked: mask((g.api_key as string) ?? ""),
      reachable: null,
      detail: (g.api_key as string) ? "key set" : "no key",
      modelCount: null,
    }));
  } catch {
    return [];
  }
}

/** Full gateway incl. secret — SERVER ONLY, never return to client. */
export async function getGatewaySecret(key: string): Promise<{ base_url: string; api_key: string; label: string; enabled: boolean } | null> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("provider_gateways")
      .select("base_url,api_key,label,enabled")
      .eq("key", key)
      .single();
    if (!data || !data.enabled || !(data.api_key as string)) return null;
    return {
      base_url: (data.base_url as string).replace(/\/$/, ""),
      api_key: data.api_key as string,
      label: (data.label as string) ?? key,
      enabled: true,
    };
  } catch {
    return null;
  }
}

/** Live probe: GET {base}/models with the stored key (45s cached — admin display only). */
const probeCache = new Map<string, { at: number; val: { reachable: boolean | null; detail: string; modelCount: number | null } }>();
const PROBE_TTL_MS = 45_000;

export async function probeGateway(key: string, baseUrl: string, apiKey: string): Promise<{ reachable: boolean | null; detail: string; modelCount: number | null }> {
  if (!apiKey) return { reachable: false, detail: "no key", modelCount: null };
  const hit = probeCache.get(key);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.val;
  const done = (val: { reachable: boolean | null; detail: string; modelCount: number | null }) => {
    probeCache.set(key, { at: Date.now(), val });
    return val;
  };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return done({ reachable: false, detail: `HTTP ${res.status} ${text.slice(0, 120)}`.trim(), modelCount: null });
    try {
      const j = JSON.parse(text) as { data?: unknown[] };
      const n = Array.isArray(j.data) ? j.data.length : null;
      return done({ reachable: true, detail: "reachable", modelCount: n });
    } catch {
      return done({ reachable: null, detail: "key set, unexpected /models shape", modelCount: null });
    }
  } catch (e) {
    return done({ reachable: false, detail: e instanceof Error ? e.message.slice(0, 200) : "unreachable", modelCount: null });
  }
}

/** Fetch live model ids from a gateway (server-side). */
export async function fetchGatewayModels(key: string): Promise<{ id: string; name: string; type: string }[]> {
  const gw = await getGatewaySecret(key);
  if (!gw) return [];
  try {
    const res = await fetch(`${gw.base_url}/models`, {
      headers: { Authorization: `Bearer ${gw.api_key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: Array<{ id: string; name?: string; type?: string; object?: string }> };
    if (!Array.isArray(j.data)) return [];
    return j.data.map((m) => ({ id: m.id, name: m.name ?? m.id, type: m.type ?? m.object ?? "model" }));
  } catch {
    return [];
  }
}
