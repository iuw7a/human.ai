import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sessionUser, isMissingTableError } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

/**
 * POST /api/humi/voice-call — bootstrap a live voice-call session.
 * Body: { assistantId }. Verifies the caller owns the Humi assistant,
 * creates a dedicated conversation for the call, returns its id.
 * Audio itself is captured in the browser; the reply stream reuses
 * /api/chat and spoken audio comes from POST /api/tts. No keys in client.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const body = (await req.json().catch(() => null)) as { assistantId?: unknown } | null;
    const assistantId = typeof body?.assistantId === "string" ? body.assistantId : "";
    if (!assistantId) return Response.json({ error: "assistantId required." }, { status: 400 });
    const admin = createAdminSupabase();
    const { data: asst, error: asstError } = await admin
      .from("humi_assistants")
      .select("id,model_id,name")
      .eq("id", assistantId)
      .eq("user_id", user.id)
      .single();
    if (asstError || !asst) return Response.json({ error: "Assistant not found." }, { status: 404 });
    const id = newChatId();
    const { error } = await admin.from("chats").insert({
      id,
      user_id: user.id,
      model_id: (asst as { model_id: string }).model_id,
      title: `${(asst as { name: string }).name} call`,
      humi_assistant_id: assistantId,
    });
    if (error) throw error;
    return Response.json(
      { chat: { id, model_id: (asst as { model_id: string }).model_id } },
      { status: 201 }
    );
  } catch (e) {
    if (isMissingTableError(e)) {
      return Response.json(
        { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
        { status: 500 }
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (/humi_assistant_id|column/i.test(msg)) {
      return Response.json(
        { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
        { status: 500 }
      );
    }
    return Response.json({ error: "Could not start voice call." }, { status: 500 });
  }
}
