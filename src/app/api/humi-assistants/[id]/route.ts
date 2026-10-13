import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sessionUser, isMissingTableError } from "@/lib/bots";
import { sanitizeAssistant } from "@/lib/humi/validation";
import { listDbModels } from "@/lib/admin";
import { getEffectiveSubscription, canAccessModel, upgradeMessage } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toRecord(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? "Humi"),
    avatar_url: String(row.avatar_url ?? ""),
    personality: row.personality ?? "friendly",
    custom_instructions: String(row.custom_instructions ?? ""),
    language: row.language ?? "auto",
    voice: row.voice ?? "server",
    voice_enabled: row.voice_enabled !== false,
    model_id: String(row.model_id ?? "human-ai"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function missingTable(): Response {
  return Response.json(
    { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
    { status: 500 }
  );
}

/** Ownership check: row must belong to the caller, else 404 (never leak existence). */
async function ownRow(admin: ReturnType<typeof createAdminSupabase>, userId: string, id: string) {
  const { data, error } = await admin
    .from("humi_assistants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

/** GET /api/humi-assistants/[id] — your own Humi or 404. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const admin = createAdminSupabase();
    const row = await ownRow(admin, user.id, params.id);
    if (!row) return Response.json({ error: "Assistant not found." }, { status: 404 });
    return Response.json({ assistant: toRecord(row) });
  } catch (e) {
    if (isMissingTableError(e)) return missingTable();
    return Response.json({ error: "Failed to load assistant." }, { status: 500 });
  }
}

/** PATCH /api/humi-assistants/[id] — update your own Humi. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const admin = createAdminSupabase();
    const current = await ownRow(admin, user.id, params.id);
    if (!current) return Response.json({ error: "Assistant not found." }, { status: 404 });
    // Merge provided fields over the stored row so partial updates (e.g. rename)
    // never reset the other settings.
    const clean = sanitizeAssistant({
      name: body.name ?? current.name,
      avatar_url: body.avatar_url ?? current.avatar_url,
      personality: body.personality ?? current.personality,
      custom_instructions: body.custom_instructions ?? current.custom_instructions,
      language: body.language ?? current.language,
      voice: body.voice ?? current.voice,
      voice_enabled: body.voice_enabled ?? current.voice_enabled,
      model_id: body.model_id ?? current.model_id,
    });
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

    const v = clean.value;
    const { error } = await admin
      .from("humi_assistants")
      .update({
        name: v.name,
        avatar_url: v.avatar_url,
        personality: v.personality,
        custom_instructions: v.custom_instructions,
        language: v.language,
        voice: v.voice,
        voice_enabled: v.voice_enabled,
        model_id: modelId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (error) throw error;
    const row = await ownRow(admin, user.id, params.id);
    if (!row) return Response.json({ error: "Assistant not found." }, { status: 404 });
    return Response.json({ assistant: toRecord(row) });
  } catch (e) {
    if (isMissingTableError(e)) return missingTable();
    return Response.json({ error: "Failed to save assistant." }, { status: 500 });
  }
}

/** DELETE /api/humi-assistants/[id] — delete your own Humi (chats cascade). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const admin = createAdminSupabase();
    const { error } = await admin
      .from("humi_assistants")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    if (isMissingTableError(e)) return missingTable();
    return Response.json({ error: "Failed to delete assistant." }, { status: 500 });
  }
}
