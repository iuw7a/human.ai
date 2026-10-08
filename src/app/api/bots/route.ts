import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isMissingTableError, MAX_BOTS_PER_USER, missingTableResponse, normalizeSlug, resolveBotModel, sessionUser, toBot, userIsPro, validSlug } from "@/lib/bots";
import { defaultDbModelSlug, logAppError } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots — the owner's bots (Pro only). */
export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    if (!(await userIsPro(user.id))) {
      return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
    }
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("bots")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ bots: (data ?? []).map(toBot) });
  } catch (e) {
    if (isMissingTableError(e)) return missingTableResponse();
    return Response.json({ error: e instanceof Error ? e.message : "Failed to load bots." }, { status: 500 });
  }
}

/** POST /api/bots — create a Bot (Pro only). */
export async function POST(req: NextRequest) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    if (!(await userIsPro(user.id))) {
      return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
    }
    const b = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      personality?: string;
      instructions?: string;
      model_id?: string;
      memory_enabled?: boolean;
      include_user_memory?: boolean;
      tools?: { web_search?: boolean; mcp_server_ids?: string[] };
      theme?: { accent?: string };
      voice?: { tts_enabled?: boolean; stt_enabled?: boolean };
      visibility?: string;
      category?: string;
    };
    const name = (b.name ?? "").trim().slice(0, 60);
    if (!name) return Response.json({ error: "A Bot name is required." }, { status: 400 });
    const slug = normalizeSlug(b.slug ?? name);
    if (!validSlug(slug)) {
      return Response.json({ error: "Bot ID must be 3-30 chars: a-z, 0-9, dash." }, { status: 400 });
    }
    // The backend decides the model (admin default). Users never choose it.
    const modelId = await defaultDbModelSlug();
    const model = await resolveBotModel(modelId);
    if (!model.ok) return Response.json({ error: "No usable model is configured. Contact support." }, { status: 500 });

    const admin = createAdminSupabase();
    const { data: existing } = await admin.from("bots").select("id").eq("owner_id", user.id);
    if ((existing ?? []).length >= MAX_BOTS_PER_USER) {
      return Response.json({ error: `You can create up to ${MAX_BOTS_PER_USER} Bots.` }, { status: 400 });
    }
    const { data: taken } = await admin.from("bots").select("id").eq("slug", slug).maybeSingle();
    if (taken) return Response.json({ error: `Bot ID "${slug}" is already taken.` }, { status: 409 });

    const tools =
      b.tools && typeof b.tools === "object"
        ? {
            web_search: b.tools.web_search !== false,
            mcp_server_ids: Array.isArray(b.tools.mcp_server_ids)
              ? b.tools.mcp_server_ids.filter((s): s is string => typeof s === "string").slice(0, 20)
              : [],
          }
        : { web_search: true, mcp_server_ids: [] };
    const accent =
      typeof b.theme?.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(b.theme.accent) ? b.theme.accent : "#e5484d";
    const visibility = b.visibility === "public" || b.visibility === "unlisted" ? b.visibility : "private";
    const category = (b.category ?? "").trim().slice(0, 40) || "General";

    const insertRow: Record<string, unknown> = {
      owner_id: user.id,
      slug,
      name,
      description: (b.description ?? "").slice(0, 500),
      personality: (b.personality ?? "").slice(0, 2000),
      instructions: (b.instructions ?? "").slice(0, 4000),
      model_id: modelId,
      memory_enabled: b.memory_enabled !== false,
      include_user_memory: !!b.include_user_memory,
      tools,
      theme: { accent },
      visibility,
      category,
      voice: {
        tts_enabled: !!b.voice?.tts_enabled,
        stt_enabled: !!b.voice?.stt_enabled,
      },
    };
    let data: Record<string, unknown> | null = null;
    {
      const res = await admin.from("bots").insert(insertRow).select("*").single();
      if (!res.error) {
        data = res.data;
      } else if (/visibility|category|column/i.test(res.error.message ?? "")) {
        // Pre-migration database: retry without the new columns.
        delete insertRow.visibility;
        delete insertRow.category;
        const retry = await admin.from("bots").insert(insertRow).select("*").single();
        if (retry.error) throw retry.error;
        data = retry.data;
      } else {
        throw res.error;
      }
    }
    if (!data) throw new Error("Could not create Bot.");
    return Response.json({ bot: toBot(data) });
  } catch (e) {
    void logAppError("api/bots POST", e instanceof Error ? e.message : "Failed.");
    if (isMissingTableError(e)) return missingTableResponse();
    return Response.json({ error: e instanceof Error ? e.message : "Could not create Bot." }, { status: 500 });
  }
}
