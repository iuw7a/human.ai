import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getAccessibleBot, sessionUser } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug]/favorite — is this bot favorited by me? */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const admin = createAdminSupabase();
    const found = await getAccessibleBot(params.slug, user.id);
    if (!found) return Response.json({ error: "Bot not found." }, { status: 404 });
    const { data } = await admin
      .from("bot_favorites")
      .select("bot_id")
      .eq("user_id", user.id)
      .eq("bot_id", found.bot.id)
      .maybeSingle();
    return Response.json({ favorite: !!data });
  } catch {
    return Response.json({ favorite: false });
  }
}

/** POST /api/bots/[slug]/favorite {favorite} — save/unsave a bot. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const found = await getAccessibleBot(params.slug, user.id);
  if (!found) return Response.json({ error: "Bot not found." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { favorite?: boolean } | null;
  const admin = createAdminSupabase();
  try {
    if (b?.favorite === false) {
      await admin.from("bot_favorites").delete().eq("user_id", user.id).eq("bot_id", found.bot.id);
    } else {
      await admin.from("bot_favorites").upsert(
        { user_id: user.id, bot_id: found.bot.id },
        { onConflict: "user_id,bot_id" }
      );
    }
    return Response.json({ favorite: b?.favorite !== false });
  } catch {
    return Response.json({ error: "Favorites unavailable — run supabase/human_bots.sql once." }, { status: 500 });
  }
}
