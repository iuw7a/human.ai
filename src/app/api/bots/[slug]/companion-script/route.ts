import { NextRequest } from "next/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";
import { buildCompanionScript } from "@/lib/bot-desktop/companion.ps1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bots/[slug]/companion-script?base= — download the Desktop companion (.ps1).
 * Owner + Pro, browser session only (this mints nothing secret).
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });

  const rawBase = req.nextUrl.searchParams.get("base") ?? "";
  let apiBase = "https://usehuman.de";
  try {
    const u = new URL(rawBase);
    if (u.protocol === "http:" || u.protocol === "https:") apiBase = u.origin;
  } catch {
    // default production base
  }

  const script = buildCompanionScript({
    apiBase,
    slug: bot.slug,
    name: bot.name,
    avatarUrl: bot.avatar_url,
    accent: bot.theme.accent,
    size: bot.companion.size,
    alwaysOnTop: bot.companion.always_on_top,
    tts: bot.voice.tts_enabled,
    stt: bot.voice.stt_enabled,
  });

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="human-bot-${bot.slug}.ps1"`,
    },
  });
}
