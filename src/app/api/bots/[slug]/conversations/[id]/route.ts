import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { effectiveOwnerId, getOwnedBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownConversation(slug: string, convId: string, userId: string) {
  const bot = await getOwnedBot(slug, userId);
  if (!bot) return null;
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bot_conversations")
    .select("id,title,created_at")
    .eq("id", convId)
    .eq("bot_id", bot.id)
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  return { bot, conv: data };
}

/** GET — conversation history (owner + Pro; session or companion key). */
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const found = await ownConversation(params.slug, params.id, ownerId);
  if (!found) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bot_messages")
    .select("role,content,images,created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })
    .limit(100);
  return Response.json({
    conversation: found.conv,
    messages: (data ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      images: (m.images ?? []).filter(
        (i: { url?: string }) => typeof i?.url === "string" && i.url.startsWith("https://")
      ),
    })),
  });
}

/** DELETE — remove conversation + messages (owner + Pro; session or companion key). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const found = await ownConversation(params.slug, params.id, ownerId);
  if (!found) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const admin = createAdminSupabase();
  await admin.from("bot_conversations").delete().eq("id", params.id);
  return Response.json({ ok: true });
}
