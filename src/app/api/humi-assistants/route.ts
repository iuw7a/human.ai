import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sessionUser, isMissingTableError } from "@/lib/bots";
import { sanitizeAssistant, MAX_ASSISTANTS_PER_USER, type AssistantRecord } from "@/lib/humi/validation";
import { listDbModels } from "@/lib/admin";
import { getEffectiveSubscription, canAccessModel, upgradeMessage } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toRecord(row: Record<string, unknown>): AssistantRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? "Humi"),
    avatar_url: String(row.avatar_url ?? ""),
    personality: (row.personality as AssistantRecord["personality"]) ?? "friendly",
    custom_instructions: String(row.custom_instructions ?? ""),
    language: (row.language as AssistantRecord["language"]) ?? "auto",
    voice: (row.voice as AssistantRecord["voice"]) ?? "server",
    voice_enabled: row.voice_enabled !== false,
    model_id: String(row.model_id ?? "human-ai"),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function missingTable(): Response {
  return Response.json(
    { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
    { status: 500 }
  );
}

/** GET /api/humi-assistants — the caller's own Humis (RLS + explicit owner filter). */
export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("humi_assistants")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ assistants: (data ?? []).map(toRecord) });
  } catch (e) {
    if (isMissingTableError(e)) return missingTable();
    return Response.json({ error: "Failed to load assistants." }, { status: 500 });
  }
}

/** POST /api/humi-assistants — create your own Humi (max 10). */
export async function POST(req: NextRequest) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const body = (await req.json().catch(() => null)) as unknown;
    const clean = sanitizeAssistant(body);
    if (!clean.ok) {
      return Response.json(
        {
          error:
            clean.reason === "secret"
              ? "Custom instructions must not contain secrets."
              : "Invalid assistant settings.",
          issues: clean.issues,
        },
        { status: 400 }
      );
    }
    // Model must be a real, enabled registry model the user may actually use.
    // The frontend hint is never trusted — the server verifies entitlement here
    // and /api/chat verifies again on every message.
    const models = await listDbModels();
    const enabled = models.filter((m) => m.enabled);
    const requested = enabled.find((m) => m.id === clean.value.model_id);
    const sub = await getEffectiveSubscription(user.id);
    if (requested && !canAccessModel(sub, requested)) {
      return Response.json({ error: upgradeMessage(requested.access_level), upgrade: true }, { status: 403 });
    }
    const modelId = requested
      ? requested.id
      : (enabled.find((m) => m.is_default)?.id ?? "human-ai");

    const admin = createAdminSupabase();
    const { data: existing } = await admin.from("humi_assistants").select("id").eq("user_id", user.id);
    if ((existing ?? []).length >= MAX_ASSISTANTS_PER_USER) {
      return Response.json({ error: `You can create up to ${MAX_ASSISTANTS_PER_USER} Humis.` }, { status: 400 });
    }
    const v = clean.value;
    const { data, error } = await admin
      .from("humi_assistants")
      .insert({
        user_id: user.id,
        name: v.name,
        avatar_url: v.avatar_url,
        personality: v.personality,
        custom_instructions: v.custom_instructions,
        language: v.language,
        voice: v.voice,
        voice_enabled: v.voice_enabled,
        model_id: modelId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ assistant: toRecord(data) }, { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) return missingTable();
    return Response.json({ error: "Failed to create assistant." }, { status: 500 });
  }
}
