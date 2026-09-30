import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { extractBotMemory, runBotTurn, type BotBodyMessage } from "@/lib/bot-chat";
import { effectiveOwnerId, getOwnedBot, resolveBotModel, touchBot, userIsPro } from "@/lib/bots";
import { logAppError } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/bots/[slug]/chat {conversation_id, messages:[{role,content,images?}]}
 * Streaming Bot turn (SSE like /api/chat). Owner + Pro only.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });

  try {
    const body = (await req.json()) as {
      conversation_id?: string;
      messages?: BotBodyMessage[];
    };
    const convId = (body.conversation_id ?? "").slice(0, 64);
    if (!convId) return Response.json({ error: "conversation_id required." }, { status: 400 });
    const messages = (body.messages ?? []).slice(-30);
    if (messages.length === 0) return Response.json({ error: "No messages provided." }, { status: 400 });

    const admin = createAdminSupabase();
    const { data: conv } = await admin
      .from("bot_conversations")
      .select("id")
      .eq("id", convId)
      .eq("bot_id", bot.id)
      .eq("user_id", ownerId)
      .single();
    if (!conv) return Response.json({ error: "Conversation not found." }, { status: 404 });

    const model = await resolveBotModel(bot.model_id);
    if (!model.ok) return Response.json({ error: model.error }, { status: 400 });

    await touchBot(bot.id);
    const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        try {
          const { full } = await runBotTurn(
            {
              bot,
              ownerId,
              provider: model.provider,
              providerModelId: model.providerModelId,
              messages,
            },
            send
          );
          send("[DONE]");
          // Persist assistant reply + title (best effort, after stream).
          try {
            await admin.from("bot_messages").insert({
              conversation_id: convId,
              bot_id: bot.id,
              user_id: ownerId,
              role: "assistant",
              content: full.slice(0, 20000),
              images: [],
            });
            const { data: existing } = await admin
              .from("bot_conversations")
              .select("title")
              .eq("id", convId)
              .single();
            if (!existing?.title || existing.title === "New conversation") {
              await admin
                .from("bot_conversations")
                .update({
                  title: lastUserText.slice(0, 80) || "Conversation",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", convId);
            } else {
              await admin.from("bot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
            }
            await admin.from("bots").update({ last_active_at: new Date().toISOString() }).eq("id", bot.id);
          } catch {
            // persistence best effort
          }
          extractBotMemory(bot, model.provider, model.providerModelId, lastUserText, full);
        } catch (e) {
          const raw = e instanceof Error ? e.message : "Generation failed.";
          void logAppError("api/bots chat", raw, { model: bot.model_id });
          send(JSON.stringify({ error: raw }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    void logAppError("api/bots chat", e instanceof Error ? e.message : "Invalid request.");
    return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: 500 });
  }
}
