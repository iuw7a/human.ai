import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { effectiveOwnerId, getOwnedBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/bots/[slug]/messages {conversation_id, content} — persist a user message (companion key). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { conversation_id?: string; content?: string } | null;
  const convId = (b?.conversation_id ?? "").trim();
  const content = (b?.content ?? "").trim().slice(0, 20000);
  if (!convId || !content) return Response.json({ error: "conversation_id and content required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: own } = await admin
    .from("bot_conversations")
    .select("id")
    .eq("id", convId)
    .eq("bot_id", bot.id)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!own) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const { error } = await admin.from("bot_messages").insert({
    conversation_id: convId,
    bot_id: bot.id,
    user_id: ownerId,
    role: "user",
    content,
    images: [],
  });
  if (error) return Response.json({ error: "Could not save message." }, { status: 500 });
  await admin.from("bot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  return Response.json({ ok: true });
}
