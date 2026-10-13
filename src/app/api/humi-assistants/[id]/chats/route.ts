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

async function ownAssistant(admin: ReturnType<typeof createAdminSupabase>, userId: string, id: string) {
  const { data, error } = await admin
    .from("humi_assistants")
    .select("id,model_id,name")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data as { id: string; model_id: string; name: string };
}

/** GET /api/humi-assistants/[id]/chats — conversation history of your own Humi. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const admin = createAdminSupabase();
    const asst = await ownAssistant(admin, user.id, params.id);
    if (!asst) return Response.json({ error: "Assistant not found." }, { status: 404 });
    const { data, error } = await admin
      .from("chats")
      .select("id,title,model_id,updated_at")
      .eq("user_id", user.id)
      .eq("humi_assistant_id", params.id)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return Response.json({ chats: data ?? [] });
  } catch (e) {
    if (isMissingTableError(e)) {
      return Response.json(
        { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
        { status: 500 }
      );
    }
    // Missing humi_assistant_id column (schema.sql applied, humi_schema.sql not yet).
    const msg = e instanceof Error ? e.message : "";
    if (/humi_assistant_id|column/i.test(msg)) {
      return Response.json(
        { error: "Database not set up: run supabase/humi_schema.sql once in the Supabase SQL editor, then retry." },
        { status: 500 }
      );
    }
    return Response.json({ error: "Failed to load conversations." }, { status: 500 });
  }
}

/** POST /api/humi-assistants/[id]/chats — start a conversation with your own Humi. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const admin = createAdminSupabase();
    const asst = await ownAssistant(admin, user.id, params.id);
    if (!asst) return Response.json({ error: "Assistant not found." }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : asst.name;
    const id = newChatId();
    const { error } = await admin.from("chats").insert({
      id,
      user_id: user.id,
      model_id: asst.model_id,
      title,
      humi_assistant_id: params.id,
    });
    if (error) throw error;
    return Response.json({ chat: { id, title, model_id: asst.model_id } }, { status: 201 });
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
    return Response.json({ error: "Failed to create conversation." }, { status: 500 });
  }
}
