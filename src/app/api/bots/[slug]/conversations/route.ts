import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { effectiveOwnerId, getOwnedBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug]/conversations — list (owner + Pro; session or companion key). */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bot_conversations")
    .select("id,title,created_at,updated_at")
    .eq("bot_id", bot.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  return Response.json({ conversations: data ?? [] });
}

/** POST /api/bots/[slug]/conversations — start one (owner + Pro; session or companion key). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  const admin = createAdminSupabase();
  const { error } = await admin.from("bot_conversations").insert({
    id,
    bot_id: bot.id,
    user_id: ownerId,
    title: "New conversation",
  });
  if (error) return Response.json({ error: "Could not start conversation." }, { status: 500 });
  return Response.json({ id });
}
