import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { effectiveOwnerId, getOwnedBot, mergeCompanionPatch, toBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug]/companion — companion profile + settings (owner + Pro; session or companion key). */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  return Response.json({
    bot: {
      id: bot.id,
      slug: bot.slug,
      name: bot.name,
      description: bot.description,
      avatar_url: bot.avatar_url,
      theme: bot.theme,
      voice: bot.voice,
      companion: bot.companion,
    },
  });
}

/** PATCH /api/bots/[slug]/companion {x,size,always_on_top,hidden,enabled,collapsed} — persist (owner + Pro; session or companion key). */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const body = (await req.json()) as unknown;
  const companion = mergeCompanionPatch(body, bot.companion);
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("bots")
    .update({ companion, updated_at: new Date().toISOString() })
    .eq("id", bot.id)
    .select("*")
    .single();
  if (error) return Response.json({ error: "Could not save companion settings." }, { status: 500 });
  return Response.json({ companion: toBot(data).companion });
}
