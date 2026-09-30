import { NextRequest } from "next/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bots/[slug]/companion-start — download a Windows autostart launcher (.cmd).
 * Runs the companion script hidden in the background. Owner + Pro, browser session only.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });

  const cmd = `@echo off\r\nrem Human Bot Desktop autostart launcher for ${bot.slug}\r\nrem Copy this file next to human-bot-${bot.slug}.ps1 and place a shortcut in shell:startup.\r\nstart "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "& '%~dp0human-bot-${bot.slug}.ps1'"\r\n`;
  return new Response(cmd, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="human-bot-${bot.slug}-start.cmd"`,
    },
  });
}
