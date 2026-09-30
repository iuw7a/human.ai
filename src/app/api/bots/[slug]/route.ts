import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, toBot, userIsPro } from "@/lib/bots";
import { logAppError } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug] — Bot detail (owner + Pro only). */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  return Response.json({ bot });
}

/** PATCH /api/bots/[slug] — customize (owner + Pro; persists immediately). */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const b = (await req.json()) as {
      name?: string;
      description?: string;
      personality?: string;
      instructions?: string;
      memory_enabled?: boolean;
      include_user_memory?: boolean;
      tools?: { web_search?: boolean; mcp_server_ids?: unknown };
      theme?: { accent?: unknown };
      voice?: { tts_enabled?: unknown; stt_enabled?: unknown };
      companion?: { x?: unknown; y?: unknown; size?: unknown; always_on_top?: unknown; hidden?: unknown };
    };
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = b.name.trim().slice(0, 60);
      if (!name) return Response.json({ error: "A Bot name is required." }, { status: 400 });
      patch.name = name;
    }
    if (b.description !== undefined) patch.description = b.description.slice(0, 500);
    if (b.personality !== undefined) patch.personality = b.personality.slice(0, 2000);
    if (b.instructions !== undefined) patch.instructions = b.instructions.slice(0, 4000);
    // Model is backend/admin-owned: never user-settable here.
    if (b.memory_enabled !== undefined) patch.memory_enabled = !!b.memory_enabled;
    if (b.include_user_memory !== undefined) patch.include_user_memory = !!b.include_user_memory;
    if (b.tools !== undefined && typeof b.tools === "object" && b.tools !== null) {
      patch.tools = {
        web_search: (b.tools as { web_search?: boolean }).web_search !== false,
        mcp_server_ids: Array.isArray((b.tools as { mcp_server_ids?: unknown }).mcp_server_ids)
          ? ((b.tools as { mcp_server_ids?: unknown }).mcp_server_ids as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 20)
          : [],
      };
    }
    if (b.theme !== undefined && typeof b.theme === "object" && b.theme !== null) {
      const accent = (b.theme as { accent?: unknown }).accent;
      patch.theme = {
        accent: typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : bot.theme.accent,
      };
    }
    if (b.voice !== undefined && typeof b.voice === "object" && b.voice !== null) {
      const v = b.voice as { tts_enabled?: unknown; stt_enabled?: unknown };
      patch.voice = { tts_enabled: !!v.tts_enabled, stt_enabled: !!v.stt_enabled };
    }
    if (b.companion !== undefined && typeof b.companion === "object" && b.companion !== null) {
      const c = b.companion as Record<string, unknown>;
      const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);
      const size = typeof c.size === "number" && c.size >= 48 && c.size <= 160 ? Math.round(c.size) : bot.companion.size;
      patch.companion = {
        x: num(c.x),
        y: num(c.y),
        size,
        always_on_top: c.always_on_top !== false,
        hidden: !!c.hidden,
      };
    }
    if (Object.keys(patch).length === 0) return Response.json({ bot });
    patch.updated_at = new Date().toISOString();
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("bots").update(patch).eq("id", bot.id).select("*").single();
    if (error) throw error;
    return Response.json({ bot: toBot(data) });
  } catch (e) {
    void logAppError("api/bots PATCH", e instanceof Error ? e.message : "Failed.");
    return Response.json({ error: e instanceof Error ? e.message : "Could not update Bot." }, { status: 500 });
  }
}

/** DELETE /api/bots/[slug] — delete Bot + conversations + avatar (owner + Pro). */
export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const admin = createAdminSupabase();
    if (bot.avatar_path) {
      await admin.storage.from("bot-avatars").remove([bot.avatar_path]).catch(() => {});
    }
    await admin.from("bots").delete().eq("id", bot.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not delete Bot." }, { status: 500 });
  }
}
