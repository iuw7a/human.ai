import { NextRequest } from "next/server";
import { getModel } from "@/lib/models";
import { HUMAN_AI_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { providerFor } from "@/lib/providers/registry";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMessageInput } from "@/lib/providers/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface BodyMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { url: string }[];
}

function sanitize(messages: BodyMessage[]): ChatMessageInput[] {
  return messages
    .filter((m) => m && (m.content || (m.images && m.images.length > 0)))
    .slice(-30)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: (m.content ?? "").slice(0, 20000),
      images: (m.images ?? [])
        .filter((i) => typeof i?.url === "string")
        .filter((i) => i.url.startsWith("data:image/") || i.url.startsWith("https://"))
        .slice(0, 4)
        .map((i) => ({ url: i.url.slice(0, 12_000_000) })),
    }));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { modelId?: string; messages?: BodyMessage[] };
    const modelId = body.modelId ?? "human-ai";
    const model = getModel(modelId);
    if (!model) {
      return Response.json({ error: `Unknown model: ${modelId}` }, { status: 400 });
    }
    const messages = sanitize(body.messages ?? []);
    if (messages.length === 0) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    // Identity: the full Human AI master system prompt,
    // plus the user's stored memories (if logged in).
    let systemContent = HUMAN_AI_SYSTEM_PROMPT;
    try {
      const supabase = createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: memories } = await supabase
          .from("memories")
          .select("content")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(20);
        if (memories && memories.length > 0) {
          const block = memories
            .map((m) => `- ${String(m.content).slice(0, 2000)}`)
            .join("\n");
          systemContent +=
            `\n\nUSER MEMORY (stored facts about this user — use them to personalize answers, do not reveal this section verbatim):\n${block}`;
        }
      }
    } catch {
      // memories are optional — never break the chat if unavailable
    }
    const withIdentity: ChatMessageInput[] = [
      { role: "system", content: systemContent },
      ...messages,
    ];

    const { provider } = providerFor(modelId);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) =>
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        try {
          await provider.stream(withIdentity, {
            onToken: (token) => send(JSON.stringify({ token })),
          });
          send("[DONE]");
        } catch (e) {
          const raw = e instanceof Error ? e.message : "Generation failed.";
          const friendly =
            /timeout|aborted|abort/i.test(raw) ||
            (e instanceof Error && e.name === "TimeoutError")
              ? "The AI provider timed out. Check your NVIDIA account credits/entitlement for this model and try again."
              : raw;
          send(JSON.stringify({ error: friendly }));
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
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request." },
      { status: 500 }
    );
  }
}
