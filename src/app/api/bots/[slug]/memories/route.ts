import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug]/memories — the Bot's memory (owner + Pro). */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bot_memories")
    .select("id,content,created_at")
    .eq("bot_id", bot.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return Response.json({ memories: data ?? [], memory_enabled: bot.memory_enabled });
}

/** POST /api/bots/[slug]/memories {content} — teach the Bot (owner + Pro). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const { content } = (await req.json()) as { content?: string };
  const text = (content ?? "").trim().slice(0, 1000);
  if (!text) return Response.json({ error: "Content required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("bot_memories")
    .insert({ bot_id: bot.id, user_id: user.id, content: text })
    .select("id,content,created_at")
    .single();
  if (error) return Response.json({ error: "Could not save memory." }, { status: 500 });
  return Response.json({ memory: data });
}

/** DELETE /api/bots/[slug]/memories?id= — forget (owner + Pro). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("bot_memories").delete().eq("id", id).eq("bot_id", bot.id);
  return Response.json({ ok: true });
}
