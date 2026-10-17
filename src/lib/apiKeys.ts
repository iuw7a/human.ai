/**
 * App API key scopes + model allowlist (server + shared bits).
 * Scopes: "chat" (text models, e.g. Speed) and "images" (humi.1 images).
 * API keys only ever work with the two curated models — never legacy slugs.
 */

export const API_KEY_MODELS = ["humi1.1-speed", "humi.1-images"] as const;
export type ApiKeyModelId = (typeof API_KEY_MODELS)[number];

export type ApiKeyScope = "chat" | "images";

/** "chat" | "images" | "all" (UI/API input) → stored scope array. */
export function scopesForSelection(sel: unknown): ApiKeyScope[] {
  if (sel === "chat") return ["chat"];
  if (sel === "images") return ["images"];
  return ["chat", "images"];
}

/** Normalize whatever came back from the DB (null/legacy → full access). */
export function normalizeScopes(v: unknown): ApiKeyScope[] {
  const arr = Array.isArray(v) ? v : [];
  const out = [...new Set(arr.filter((s) => s === "chat" || s === "images"))] as ApiKeyScope[];
  return out.length > 0 ? out : ["chat", "images"];
}

export function scopeLabel(scopes: ApiKeyScope[]): string {
  const hasChat = scopes.includes("chat");
  const hasImages = scopes.includes("images");
  if (hasChat && hasImages) return "Chat + Images";
  if (hasImages) return "Images";
  return "Chat";
}

/** Which scope a model call needs (agnes provider = image model). */
export function requiredScopeForModel(model: { provider?: unknown }): ApiKeyScope {
  return (model as { provider?: unknown }).provider === "agnes" ? "images" : "chat";
}

export function isApiKeyModel(slug: string): slug is ApiKeyModelId {
  return (API_KEY_MODELS as readonly string[]).includes(slug);
}

/** True when a PostgREST error means the `scopes` column doesn't exist yet. */
export function isMissingScopesColumn(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e ?? "");
  const code = (e as { code?: unknown })?.code;
  return code === "PGRST204" || (/scopes/i.test(msg) && /column|find/i.test(msg));
}
