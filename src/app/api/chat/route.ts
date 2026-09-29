import { NextRequest } from "next/server";
import { getModel } from "@/lib/models";
import { HUMAN_AI_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { createNvidiaProvider, streamChatWithTools, toOpenAIMessage, type OpenAIMessage, type ToolCallReq } from "@/lib/providers/nvidia";
import { resolveDbModel, logAppError } from "@/lib/admin";
import { connectedTools, executeTool } from "@/lib/mcp/catalog";
import { isSearchEnabled, WEB_SEARCH_TOOL, webSearch } from "@/lib/search/langsearch";
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
      const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey)))]
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

    // MCP tools available to THIS user (their connections only).
    const mcpByOpenName = new Map<string, { serverId: string; serverName: string; tool: string }>();
    const mcpTools: { name: string; description: string; parameters: Record<string, unknown> }[] = [];
    let mcpServerNames = "";
    if (effectiveUserId) {
      try {
        const conn = await connectedTools(effectiveUserId);
        mcpServerNames = conn.servers.map((s) => s.name).join(", ");
        for (const t of conn.tools) {
          const openName = `${t.serverId}__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
          mcpByOpenName.set(openName, { serverId: t.serverId, serverName: t.serverName, tool: t.name });
          mcpTools.push({
            name: openName,
            description: t.description ?? "",
            parameters:
              t.inputSchema && typeof t.inputSchema === "object"
                ? (t.inputSchema as Record<string, unknown>)
                : { type: "object", properties: {} },
          });
        }
      } catch {
        // MCP is optional — never break chat
      }
    }
    if (mcpTools.length > 0) {
      systemContent += `\n\nCONNECTED MCP SERVERS for this user: ${mcpServerNames}. Only call a function when the user explicitly needs live or external data from these servers (prices, records, docs, lookups). For greetings, smalltalk, explanations, and anything answerable from knowledge or chat history, answer directly WITHOUT calling tools. Never call a tool just to acknowledge a message.`;
    }

    // Built-in live web search (server key) — works for everyone, no setup needed.
    const searchOn = isSearchEnabled();
    if (searchOn) {
      mcpTools.push({ ...WEB_SEARCH_TOOL });
      systemContent += `\n\nYou also have a built-in web_search function. Use it whenever the user asks about recent events, current data, prices, documentation, or anything that may be newer than your training data. Always cite the source URLs in your answer.`;
    }

    // Smalltalk fast path: greetings and one-liners never need tools.
    // Stops trigger-happy tool calls ("yo" → search_docs → failure essay).
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastText = (lastUser?.content ?? "").trim();
    const lastHasImages = (lastUser?.images ?? []).length > 0;
    const SMALLTALK =
      /^(yo|hi+|hey+|hallo+|hello+|servus|moin|na+|ok|okay+|danke\w*|thanks?|bitte|ja|nein|yes|no+|was\s+ist\s+das\??|wer\s+bist\s+du\??|wie\s+geht'?s\??)\s*[!?.…]*$/i;
    const skipTools =
      mcpTools.length > 0 && !lastHasImages && lastText.length <= 40 && SMALLTALK.test(lastText);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) =>
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        try {
          if (mcpTools.length === 0 || skipTools) {
            await provider.stream(withIdentity, {
              onToken: (token) => send(JSON.stringify({ token })),
            });
            send("[DONE]");
            return;
          }

          // Agentic loop: stream text, execute requested MCP tools, repeat.
          const history: OpenAIMessage[] = withIdentity.map(toOpenAIMessage);
          for (let round = 0; round < 4; round++) {
            const { toolCalls }: { toolCalls: ToolCallReq[] } = await streamChatWithTools(
              resolved.providerModelId,
              history,
              mcpTools,
              { onToken: (token) => send(JSON.stringify({ token })) }
            );
            if (toolCalls.length === 0) break;
            const used: { server: string; tool: string }[] = [];
            const settled = await Promise.all(
              toolCalls.slice(0, 4).map(async (tc) => {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.arguments || "{}");
                } catch {
                  args = {};
                }
                if (tc.name === WEB_SEARCH_TOOL.name) {
                  try {
                    const out = await webSearch(
                      String(args.query ?? ""),
                      typeof args.count === "number" ? args.count : 5
                    );
                    used.push({ server: "Web Search", tool: "search" });
                    return { tc, result: out };
                  } catch (e) {
                    return { tc, result: e instanceof Error ? e.message : "Web search failed." };
                  }
                }
                const def = mcpByOpenName.get(tc.name);
                if (!def || !effectiveUserId) {
                  return { tc, result: "Unknown tool — do not call it again." };
                }
                try {
                  const out = await executeTool(
                    effectiveUserId,
                    def.serverId,
                    def.tool,
                    args as Record<string, unknown>
                  );
                  used.push({ server: out.serverName, tool: def.tool });
                  return { tc, result: out.result };
                } catch (e) {
                  return { tc, result: e instanceof Error ? e.message : "Tool failed." };
                }
              })
            );
            send(JSON.stringify({ mcp_used: used }));
            history.push({
              role: "assistant",
              content: null,
              tool_calls: toolCalls.slice(0, 4).map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });
            for (const r of settled) {
              history.push({
                role: "tool",
                tool_call_id: r.tc.id,
                content: r.result.slice(0, 6000),
              });
            }
          }
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
