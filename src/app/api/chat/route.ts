import { NextRequest } from "next/server";
import { getModel } from "@/lib/models";
import { HUMAN_AI_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { createNvidiaProvider } from "@/lib/providers/nvidia";
import { resolveDbModel, logAppError } from "@/lib/admin";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
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
    const requestedSlug = body.modelId ?? "human-ai";

    // DB-backed model resolution (falls back to code registry).
    const dbModel = await resolveDbModel(requestedSlug);
    const codeModel = getModel(requestedSlug);
    const resolved = dbModel ?? (codeModel ? { ...codeModel, enabled: true, plan: "free" as const } : null);
    if (!resolved) {
      return Response.json({ error: `Unknown model: ${requestedSlug}` }, { status: 400 });
    }
    if (dbModel && !dbModel.enabled) {
      return Response.json({ error: "This model is currently disabled." }, { status: 403 });
    }
    const messages = sanitize(body.messages ?? []);
    if (messages.length === 0) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    // Auth: Supabase session OR app API key (x-api-key header).
    const supabase = createServerSupabase();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    let apiUserId: string | null = null;
    const apiKey = req.headers.get("x-api-key");
    if (!sessionUser && apiKey) {
      const hex = [...(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey)))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const admin = createAdminSupabase();
      const { data: key } = await admin.from("api_keys").select("id,user_id,enabled").eq("key_hash", hex).single();
      if (!key || !key.enabled) {
        return Response.json({ error: "Invalid API key." }, { status: 401 });
      }
      apiUserId = key.user_id;
      const { data: cur } = await admin.from("api_keys").select("usage_count").eq("id", key.id).single();
      await admin.from("api_keys").update({
        usage_count: (cur?.usage_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      }).eq("id", key.id);
    }
    const effectiveUserId = sessionUser?.id ?? apiUserId;

    // Plan gate for plus-only models.
    if (resolved.plan === "plus") {
      const admin = createAdminSupabase();
      const owner = effectiveUserId
        ? (await admin.from("profiles").select("plan").eq("id", effectiveUserId).single()).data?.plan
        : null;
      if (owner !== "plus") {
        return Response.json({ error: "This model requires a Plus plan." }, { status: 403 });
      }
    }

    // Identity: the full Human AI master system prompt,
    // plus the user's stored memories (session or API-key owner).
    let systemContent = HUMAN_AI_SYSTEM_PROMPT;
    try {
      if (effectiveUserId) {
        const admin = createAdminSupabase();
        const { data: memories } = await admin
          .from("memories")
          .select("content")
          .eq("user_id", effectiveUserId)
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

    const provider = createNvidiaProvider(resolved.providerModelId);

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
          void logAppError("api/chat", raw, { model: resolved.id });
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
    void logAppError("api/chat", e instanceof Error ? e.message : "Invalid request.");
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request." },
      { status: 500 }
    );
  }
}
