import { createAdminSupabase, createServerSupabase } from "./supabase/server";
import { resolveDbModel } from "./admin";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export const MAX_BOTS_PER_USER = 10;
export const MAX_MEMORIES_PER_BOT = 200;

export interface BotTools {
  web_search: boolean;
  mcp_server_ids: string[];
}

export interface BotTheme {
  accent: string;
}

export interface BotVoice {
  tts_enabled: boolean;
  stt_enabled: boolean;
}

export interface BotCompanion {
  x: number | null;
  y: number | null;
  size: number;
  always_on_top: boolean;
  hidden: boolean;
  enabled: boolean;
  collapsed: boolean;
}

export interface Bot {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string;
  personality: string;
  instructions: string;
  model_id: string;
  memory_enabled: boolean;
  include_user_memory: boolean;
  tools: BotTools;
  theme: BotTheme;
  voice: BotVoice;
  companion: BotCompanion;
  avatar_path: string | null;
  avatar_url: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BotStatus = "online" | "idle" | "working";

export function botStatus(bot: Pick<Bot, "last_active_at">): Exclude<BotStatus, "working"> {
  if (!bot.last_active_at) return "idle";
  return Date.now() - new Date(bot.last_active_at).getTime() < 5 * 60 * 1000 ? "online" : "idle";
}

export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/bot-avatars/${path}`;
}

function normalizeTools(v: unknown): BotTools {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    web_search: o.web_search !== false,
    mcp_server_ids: Array.isArray(o.mcp_server_ids)
      ? o.mcp_server_ids.filter((s): s is string => typeof s === "string").slice(0, 20)
      : [],
  };
}

function normalizeTheme(v: unknown): BotTheme {
  const o = (v ?? {}) as Record<string, unknown>;
  const accent = typeof o.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(o.accent) ? o.accent : "#e5484d";
  return { accent };
}

function normalizeVoice(v: unknown): BotVoice {
  const o = (v ?? {}) as Record<string, unknown>;
  return { tts_enabled: !!o.tts_enabled, stt_enabled: !!o.stt_enabled };
}

function normalizeCompanion(v: unknown): BotCompanion {
  const o = (v ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const size = typeof o.size === "number" && o.size >= 40 && o.size <= 160 ? Math.round(o.size) : 72;
  return {
    x: num(o.x),
    y: num(o.y),
    size,
    always_on_top: o.always_on_top !== false,
    hidden: !!o.hidden,
    enabled: o.enabled !== false,
    collapsed: !!o.collapsed,
  };
}

/** Merge a companion PATCH payload over existing settings (shared by both PATCH routes). */
export function mergeCompanionPatch(input: unknown, existing: BotCompanion): BotCompanion {
  const c = (input ?? {}) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(c, k);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);
  const size =
    typeof c.size === "number" && c.size >= 40 && c.size <= 160 ? Math.round(c.size) : existing.size;
  return {
    x: has("x") ? num(c.x) : existing.x,
    y: has("y") ? num(c.y) : existing.y,
    size,
    always_on_top: has("always_on_top") ? c.always_on_top !== false : existing.always_on_top,
    hidden: has("hidden") ? !!c.hidden : existing.hidden,
    enabled: has("enabled") ? c.enabled !== false : existing.enabled,
    collapsed: has("collapsed") ? !!c.collapsed : existing.collapsed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toBot(row: any): Bot {
  return {
    id: row.id,
    owner_id: row.owner_id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    personality: row.personality ?? "",
    instructions: row.instructions ?? "",
    model_id: row.model_id ?? "human-ai",
    memory_enabled: row.memory_enabled !== false,
    include_user_memory: !!row.include_user_memory,
    tools: normalizeTools(row.tools),
    theme: normalizeTheme(row.theme),
    voice: normalizeVoice(row.voice),
    companion: normalizeCompanion(row.companion),
    avatar_path: row.avatar_path ?? null,
    avatar_url: avatarUrl(row.avatar_path ?? null),
    last_active_at: row.last_active_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function validSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,30}$/.test(slug);
}

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, 30);
}

/** Session user (no exception). */
export async function sessionUser(): Promise<SupabaseUser | null> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Owner id via browser session OR app API key (for the Desktop companion,
 * which runs outside the browser). Same key scheme as /api/chat.
 */
export async function effectiveOwnerId(req: NextRequest): Promise<string | null> {
  const user = await sessionUser();
  if (user) return user.id;
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const admin = createAdminSupabase();
  const { data: key } = await admin.from("api_keys").select("id,user_id,enabled").eq("key_hash", hex).single();
  if (!key || !key.enabled) return null;
  return key.user_id as string;
}

/** True when the error means the Bot tables don't exist yet. */
export function isMissingTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e ?? "");
  const code = (e as { code?: unknown })?.code;
  return code === "42P01" || /relation .* does not exist/i.test(msg);
}

export function missingTableResponse(): Response {
  return Response.json(
    { error: "Database not set up: run supabase/bots_schema.sql once in the Supabase SQL editor, then retry." },
    { status: 500 }
  );
}

/** True when the user holds an active Pro (plus) subscription. SERVER ONLY. */
export async function userIsPro(userId: string): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("profiles").select("plan").eq("id", userId).single();
    return (data?.plan ?? "free") === "plus";
  } catch {
    return false;
  }
}

/** Load a bot by slug, enforcing ownership. Returns null when missing/foreign. SERVER ONLY. */
export async function getOwnedBot(slug: string, userId: string): Promise<Bot | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("bots").select("*").eq("slug", slug).single();
  if (!data || data.owner_id !== userId) return null;
  return toBot(data);
}

/** Validate a model slug for bot use (exists + enabled). Returns provider model info. */
export async function resolveBotModel(modelId: string): Promise<
  | { ok: true; provider: string; providerModelId: string; plan: "free" | "plus"; vision: boolean }
  | { ok: false; error: string }
> {
  const m = await resolveDbModel(modelId);
  if (!m) return { ok: false, error: `Unknown model "${modelId}".` };
  if (!m.enabled) return { ok: false, error: "This model is currently disabled." };
  return { ok: true, provider: m.provider, providerModelId: m.providerModelId, plan: m.plan, vision: m.vision };
}

/** Touch activity timestamp (best effort). */
export async function touchBot(botId: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin
      .from("bots")
      .update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", botId);
  } catch {
    // best effort
  }
}
