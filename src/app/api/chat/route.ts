import { NextRequest } from "next/server";
import { getModel } from "@/lib/models";
import { HUMAN_AI_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { createProviderForAsync, streamChatWithToolsFor, isGatewayProvider } from "@/lib/providers/registry";
import { toOpenAIMessage, type OpenAIMessage, type ToolCallReq } from "@/lib/providers/nvidia";
import { resolveDbModel, logAppError, getAdmin, defaultDbModelSlug } from "@/lib/admin";
import { looksLikeImageRequest, IMAGE_MODEL_ID, AUTO_MODEL_ID } from "@/lib/model-intent";
import { getEffectiveSubscription, canAccessModel, upgradeMessage } from "@/lib/subscriptions";
import { friendlyProviderError, permittedFallback } from "@/lib/ai-registry";
import { listGrantsForUser } from "@/lib/model-grants";
import { logModelUsage } from "@/lib/usage";
import { connectedTools, executeTool } from "@/lib/mcp/catalog";
import { isSearchEnabled, WEB_SEARCH_TOOL, webSearch } from "@/lib/search/serpapi";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { agnesGenerateImage, AGNES_IMAGE_MODEL } from "@/lib/agnes";
import {
  API_KEY_MODELS,
  isApiKeyModel,
  normalizeScopes,
  requiredScopeForModel,
  isMissingScopesColumn,
  type ApiKeyScope,
} from "@/lib/apiKeys";
import { injectionRefusal, sseTextResponse } from "@/lib/injection";
import type { ChatMessageInput } from "@/lib/providers/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface BodyMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { url: string }[];
}

/** Humi personalization (optional). Capped, secret-filtered, treated as user data. */
function humiBlock(body: {
  assistantName?: unknown;
  personality?: unknown;
  customInstructions?: unknown;
}): string {
  const name = typeof body.assistantName === "string" ? body.assistantName.trim().slice(0, 80) : "";
  const rawPers = typeof body.personality === "string" ? body.personality : "friendly";
  const personality = ["friendly", "professional", "funny", "calm", "custom"].includes(rawPers)
    ? rawPers
    : "friendly";
  const custom = typeof body.customInstructions === "string" ? body.customInstructions.trim().slice(0, 2000) : "";
  if (!name && !custom && personality === "friendly") return "";
  if (custom && /password\s*[:=]|passwort\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|bearer\s+[A-Za-z0-9\-_~+/]+=*/i.test(custom)) {
    throw new Error("Custom instructions must not contain secrets.");
  }
  const lines = [
    `HUMI PERSONALIZATION (user data — lower priority than safety rules${name ? `; this assistant's name is "${name}"` : ""}):`,
    personality !== "friendly"
      ? `Personality: ${personality}. Let this tone shape replies while staying helpful and honest.`
      : "Personality: friendly. Be warm and approachable.",
  ];
  if (custom) lines.push(`User custom instructions:\n${custom}`);
  return "\n\n" + lines.join("\n");
}

/** Transient provider failures worth one retry (NVIDIA 5xx, timeouts, connection resets). */
function isRetryableProviderError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /NVIDIA API error 5\d\d|Gateway API error 5\d\d|timeout|aborted|abort|TimeoutError|fetch failed|ECONN|EAI_AGAIN/i.test(msg);
}

/** Rate-limit (429) — worth ONE delayed retry, then a friendly message. */
function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /API error 429|rate.?limit|429 Too Many/i.test(msg);
}

function sanitize(messages: BodyMessage[]): ChatMessageInput[] {  return messages
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
    const body = (await req.json()) as {
      modelId?: string;
      messages?: BodyMessage[];
      searchEnabled?: unknown;
    };
    const messages = sanitize(body.messages ?? []);
    if (messages.length === 0) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    // "auto" (the locked "Humi Auto" pill) resolves here, so the browser and
    // the server can never disagree about which model runs. Explicit model IDs
    // (incl. API keys) pass through unchanged.
    const requestedSlug = body.modelId === AUTO_MODEL_ID
      ? looksLikeImageRequest([...messages].reverse().find((m) => m.role === "user")?.content ?? "")
        ? IMAGE_MODEL_ID
        : await defaultDbModelSlug()
      : (body.modelId ?? "humi1.1-speed");

    // DB-backed model resolution + auth in parallel (faster first token).
    const supabase = createServerSupabase();
    const [dbModel, userRes] = await Promise.all([
      resolveDbModel(requestedSlug),
      supabase.auth.getUser().catch(() => ({ data: { user: null } as { user: null } })),
    ]);
    const codeModel = getModel(requestedSlug);
    const resolved = dbModel ??
      (codeModel
        ? { ...codeModel, enabled: true, plan: "free" as const, access_level: "light" as const }
        : null);
    if (!resolved) {
      return Response.json({ error: `Unknown model: ${requestedSlug}` }, { status: 400 });
    }
    if (!resolved.enabled) {
      return Response.json({ error: "This model is currently disabled." }, { status: 403 });
    }
    // `messages` already sanitized above (needed to resolve "auto").
    // Auth: Supabase session OR app API key (x-api-key header).
    const {
      data: { user: sessionUser },
    } = (userRes as { data: { user: { id: string } | null } });
    let apiUserId: string | null = null;
    let keyScopes: ApiKeyScope[] = ["chat", "images"];
    const apiKey = req.headers.get("x-api-key");
    if (!sessionUser && apiKey) {
      const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey)))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const admin = createAdminSupabase();
      const attempt = await admin
        .from("api_keys")
        .select("id,user_id,enabled,scopes")
        .eq("key_hash", hex)
        .single();
      let key: { id: string; user_id: string; enabled: boolean; scopes?: unknown } | null =
        attempt.data;
      if (attempt.error) {
        if (!isMissingScopesColumn(attempt.error)) {
          return Response.json({ error: "Invalid API key." }, { status: 401 });
        }
        // scopes column missing (migration pending) — key works with full access.
        const fb = await admin
          .from("api_keys")
          .select("id,user_id,enabled")
          .eq("key_hash", hex)
          .single();
        if (fb.error || !fb.data) {
          return Response.json({ error: "Invalid API key." }, { status: 401 });
        }
        key = fb.data;
      }
      if (!key || !key.enabled) {
        return Response.json({ error: "Invalid API key." }, { status: 401 });
      }
      apiUserId = key.user_id;
      keyScopes = normalizeScopes(key.scopes);
      const { data: cur } = await admin.from("api_keys").select("usage_count").eq("id", key.id).single();
      await admin.from("api_keys").update({
        usage_count: (cur?.usage_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      }).eq("id", key.id);
    }
    const effectiveUserId = sessionUser?.id ?? apiUserId;

    // Subscription gate: server is the source of truth. Frontend model IDs,
    // request params or client state can never grant premium access.
    // Expired/suspended subscriptions lose premium immediately.
    const sub = await getEffectiveSubscription(effectiveUserId);
    const rawPlan = (resolved as { plan?: unknown }).plan;
    const rawAccess = (resolved as { access_level?: unknown }).access_level;
    const normalizedModel: { plan: "free" | "plus" | "pro"; access_level: "light" | "pro" | "high" | "extra" } = {
      plan: rawPlan === "plus" || rawPlan === "pro" ? rawPlan : "free",
      access_level:
        rawAccess === "pro" || rawAccess === "high" || rawAccess === "extra"
          ? rawAccess
          : rawPlan === "plus" || rawPlan === "pro"
            ? "pro"
            : "light",
    };
    if (!canAccessModel(sub, normalizedModel)) {
      // Via-admin grant overrides plan gates (explicit per-user access).
      let granted = false;
      if (effectiveUserId) {
        try {
          const grants = await listGrantsForUser(effectiveUserId);
          granted = grants.includes(requestedSlug);
        } catch {
          granted = false;
        }
      }
      // Super admins (admin/super_admin) may chat on every enabled model.
      if (!granted) {
        try {
          granted = (await getAdmin()) !== null;
        } catch {
          granted = false;
        }
      }
      if (!granted) {
        return Response.json(
          {
            error: upgradeMessage(String(normalizedModel.access_level)),
            upgrade: true,
            requiredAccess: normalizedModel.access_level,
            plan: sub.plan,
          },
          { status: 403 }
        );
      }
    }

    // Non-CodeCraft gateways are grant/admin-only: a Plus plan alone
    // never unlocks kira/bynara/openrouter/... — only your explicit grant does.
    {
      const gw = (resolved as { provider?: unknown }).provider;
      if (typeof gw === "string" && isGatewayProvider(gw) && gw !== "codecraft") {
        let ok = false;
        if (effectiveUserId) {
          try {
            ok = (await listGrantsForUser(effectiveUserId)).includes(requestedSlug);
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          try {
            ok = (await getAdmin()) !== null;
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          return Response.json(
            {
              error: "This model is admin-assigned only. Ask an administrator for access.",
              upgrade: true,
              requiredAccess: normalizedModel.access_level,
              plan: sub.plan,
            },
            { status: 403 }
          );
        }
      }
    }

    // API keys are pinned to the two curated models (Speed + humi.1 images),
    // and each key only covers its scopes (chat and/or images).
    // Browser sessions are unaffected (legacy chats keep resolving).
    if (apiUserId) {
      if (!isApiKeyModel(requestedSlug)) {
        return Response.json(
          {
            error: `API keys support only ${API_KEY_MODELS.join(" and ")}.`,
          },
          { status: 403 }
        );
      }
      const need = requiredScopeForModel(resolved);
      if (!keyScopes.includes(need)) {
        return Response.json(
          {
            error:
              need === "images"
                ? "This API key is chat-only. Create an images key to generate images."
                : "This API key is images-only. Create a chat key for text models.",
          },
          { status: 403 }
        );
      }
    }

    // Prompt-injection tripwire (deterministic, before any provider call):
    // extraction demands, instruction overrides, jailbreaks and false
    // "ich bin der dev" authority claims get a canned refusal — the model
    // never sees them, so nothing internal can leak. Covers both models.
    const tripwireText =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const tripwireHit = injectionRefusal(tripwireText);
    if (tripwireHit) {
      return sseTextResponse(tripwireHit);
    }

    // Image model (humi.1 images): text-to-image via Agnes, same SSE contract.
    // Prompt = last user message. Returns markdown with the image.
    if ((resolved as { provider?: unknown }).provider === "agnes") {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const prompt = (lastUserMsg?.content ?? "").trim().slice(0, 2000);
      const encoder = new TextEncoder();
      if (!prompt) {
        return Response.json({ error: "Describe the image first." }, { status: 400 });
      }
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: string) =>
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          try {
            const out = await agnesGenerateImage({
              prompt,
              size: "1024x1024",
              model: (resolved as { providerModelId?: string }).providerModelId || AGNES_IMAGE_MODEL,
            });
            const displayName =
              (resolved as { name?: string }).name || "humi.1 images";
            const md =
              `![${prompt.slice(0, 120)}](${out.url})\n\n` +
              `*Generated with ${displayName}*`;
            // Stream in chunks so the UI typing effect still works.
            for (let i = 0; i < md.length; i += 200) {
              send(JSON.stringify({ token: md.slice(i, i + 200) }));
            }
            send("[DONE]");
          } catch (e) {
            const raw = e instanceof Error ? e.message : "Image generation failed.";
            void logAppError("api/chat image", raw, { model: (resolved as { id?: string }).id });
            send(JSON.stringify({ error: raw.slice(0, 500) }));
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
    }

    // Identity: the full Human AI master system prompt,
    // plus the user's stored memories (session or API-key owner),
    // plus optional Humi personalization (name/personality/instructions).
    let systemContent = HUMAN_AI_SYSTEM_PROMPT;
    try {
      systemContent += humiBlock(
        body as { assistantName?: unknown; personality?: unknown; customInstructions?: unknown }
      );
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Invalid personalization." },
        { status: 400 }
      );
    }
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

    const { provider, gatewayKey } = await createProviderForAsync(resolved.provider, resolved.providerModelId);
    const usageGateway = gatewayKey ?? (resolved.provider as string);
    const promptEstimate = Math.ceil(messages.reduce((s, m) => s + (m.content?.length ?? 0), 0) / 4);

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
      systemContent += `\n\nCONNECTED MCP SERVERS for this user: ${mcpServerNames}. Only call a function when the user explicitly needs live or external data from these servers (prices, records, docs, lookups). For greetings, smalltalk, explanations, and anything answerable from knowledge or chat history, answer directly WITHOUT calling tools. Never call a tool just to acknowledge a message. After any tool result: NEVER narrate or mention the function call, tool name, query, or result count — use the results silently and answer the user's question directly. If results are irrelevant, say briefly that you found nothing useful and answer from knowledge or ask for clarification.`;
    }

    // Image-capability questions (tolerant of typos like "bidler") are answered
    // directly from the system prompt — the web_search tool is not even offered.
    const earlyLastUser = [...messages].reverse().find((m) => m.role === "user");
    const earlyLastText = (earlyLastUser?.content ?? "").trim();
    const earlyLastHasImages = (earlyLastUser?.images ?? []).length > 0;
    const IS_IMAGE_QUESTION =
      !earlyLastHasImages &&
      /(b[i!][ld]+er|bild|image|picture|photo|zeichnung|gem[aä]lde|صور|صورة)/i.test(
        earlyLastText
      );

    // Built-in live web search (server key) — works for everyone, no setup needed.
    // The composer toggle (searchEnabled) lets the user switch it off per chat.
    const searchOn =
      isSearchEnabled() && body.searchEnabled !== false;
    if (searchOn && !IS_IMAGE_QUESTION) {
      mcpTools.push({ ...WEB_SEARCH_TOOL });
      systemContent += `\n\nYou also have a built-in web_search function. Use it whenever the user asks about recent events, current data, prices, documentation, or anything that may be newer than your training data. Always cite the source URLs in your answer. NEVER describe the search itself (no "the function was called", no queries, no result counts) — just answer with the findings. If results are irrelevant, say briefly that nothing useful was found instead of summarizing junk results.`;
    }

    // Smalltalk fast path: greetings and one-liners never need tools.
    // Stops trigger-happy tool calls ("yo" → search_docs → failure essay).
    // Covers DE + EN + AR greetings (مرحبا must never trigger a web search).
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastText = (lastUser?.content ?? "").trim();
    const lastHasImages = (lastUser?.images ?? []).length > 0;
    const SMALLTALK =
      /^(yo|hi+|hey+|hallo+|hello+|servus|moin|na+|ok|okay+|danke\w*|thanks?|thank\s+you|bitte|gerne|ja|nein|yes|no+|was\s+ist\s+das\??|wer\s+bist\s+du\??|was\s+bist\s+du\??|welche[snm]?\s+(model|modell)\b[^!?.…]{0,30}|(what|which)\s+model\b[^!?.…]{0,30}|who\s+are\s+you[^!?.…]{0,20}|what\s+are\s+you[^!?.…]{0,20}|wie\s+geht'?s\??|مرحب[ااً]?|هلا+|اهلا|أهلا|سهلا|السلام عليكم|عليكم السلام|صباح الخير|مساء الخير|شلونك|شلونج|كيفك|كيف حالك|شخبارك|شو اخبارك|تمام|زين|ماشي|طيب|نعم|اي|لا|شكرا|ممنون|ممنونة|تسلم|تسلمين|عاشت ايدك|عفوا|مع السلامة|باي)\s*[!?.…؟]*$/i;
    // Image-capability questions must be answered directly — never via tools.
    const skipTools =
      (mcpTools.length > 0 && !lastHasImages && lastText.length <= 60 && SMALLTALK.test(lastText)) ||
      IS_IMAGE_QUESTION;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) =>
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        try {
          if (mcpTools.length === 0 || skipTools) {
            // Fast path: no tools. 429s get one delayed retry (providers
            // throw before streaming any token, so retrying never duplicates).
            for (let attempt = 0; ; attempt++) {
              try {
                await provider.stream(withIdentity, {
                  onToken: (token) => send(JSON.stringify({ token })),
                });
                break;
              } catch (e) {
                if (attempt === 0 && isRateLimitError(e)) {
                  await new Promise((r) => setTimeout(r, 5000));
                  continue;
                }
                throw e;
              }
            }
            send("[DONE]");
            void logModelUsage({
              user_id: effectiveUserId,
              model_slug: requestedSlug,
              gateway_key: usageGateway,
              source: apiUserId ? "api_key" : "chat",
              prompt_tokens: promptEstimate,
              total_tokens: promptEstimate,
              success: true,
            });
            return;
          }

          // Agentic loop: stream text, execute requested MCP tools, repeat.
          const history: OpenAIMessage[] = withIdentity.map(toOpenAIMessage);
          let webSearched = false;
          const seenCalls = new Set<string>();
          const gathered: string[] = [];
          const NARRATION =
            /the function (`?\w+`? )?was called|the function call\s*\{|response from the function|result count was set/i;
          /** Plain final answer from gathered results — never replays tool history. */
          async function answerFromResults() {
            const context = gathered.join("\n\n").slice(0, 12000) || "No results were gathered.";
            await provider.stream(
              [
                {
                  role: "system",
                  content:
                    "Answer the user's question directly using the search results below. Never mention tools, functions, queries, searches or result counts. Always cite source URLs.",
                },
                {
                  role: "user",
                  content: `QUESTION: ${lastText.slice(0, 1000)}\n\nSEARCH RESULTS:\n${context}`,
                },
              ],
              { onToken: (token) => send(JSON.stringify({ token })) }
            );
          }
          for (let round = 0; round < 4; round++) {
            let toolCalls: ToolCallReq[] = [];
            let roundText = "";
            // Once data was gathered, buffer the follow-up text first:
            // narration gets discarded before the user ever sees it.
            const steer = gathered.length > 0;
            for (let attempt = 0; ; attempt++) {
              try {
                ({ toolCalls } = await streamChatWithToolsFor(
                  resolved.provider,
                  resolved.providerModelId,
                  history,
                  mcpTools,
                  {
                    onToken: (token) => {
                      roundText += token;
                      if (!steer) send(JSON.stringify({ token }));
                    },
                  }
                ));
                break;
              } catch (e) {
                // One retry for transient provider failures (NVIDIA 5xx, timeouts).
                if (attempt === 0 && isRetryableProviderError(e)) {
                  await new Promise((r) => setTimeout(r, 2500));
                  continue;
                }
                throw e;
              }
            }
            if (toolCalls.length === 0) {
              if (steer) {
                if (NARRATION.test(roundText)) {
                  await answerFromResults();
                } else {
                  send(JSON.stringify({ token: roundText }));
                }
              }
              break;
            }
            if (steer) send(JSON.stringify({ token: roundText }));
            const sigs = toolCalls.slice(0, 4).map((tc) => `${tc.name}:${tc.arguments}`);
            if (sigs.every((s) => seenCalls.has(s)) || round === 3) {
              // Model is looping on the same calls (or out of rounds).
              for (const s of sigs) seenCalls.add(s);
              await answerFromResults();
              break;
            }
            for (const s of sigs) seenCalls.add(s);
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
                  if (webSearched) {
                    return { tc, result: "You already have the search results above. Answer the user NOW in your own words with citations. No more searches, no tool descriptions." };
                  }
                  webSearched = true;
                  try {
                    const out = await webSearch(
                      String(args.query ?? ""),
                      typeof args.count === "number" ? args.count : 5
                    );
                    used.push({ server: "Web Search", tool: "search" });
                    gathered.push(out);
                    return { tc, result: `Answer the user NOW using these results. Never describe this tool call.\n\n${out}` };
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
                  gathered.push(out.result);
                  return { tc, result: `Answer the user NOW using these results. Never describe this tool call.\n\n${out.result}` };
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
          void logModelUsage({
            user_id: effectiveUserId,
            model_slug: requestedSlug,
            gateway_key: usageGateway,
              source: apiUserId ? "api_key" : "chat",
            prompt_tokens: promptEstimate,
            total_tokens: promptEstimate,
            success: true,
          });
        } catch (e) {
          const raw = e instanceof Error ? e.message : "Generation failed.";
          // Permitted fallback only: retry once on an allowed model when the
          // authorized model is dead (404/retired). Never claim premium output
          // when a weaker model answered — the fallback error path is explicit.
          const isDead = /API error 40[04]|not.?found|no longer available|end of life|does not exist|model_not_found/i.test(raw);
          if (isDead) {
            try {
              const fb = await permittedFallback(sub, resolved.id);
              if (fb && fb.id !== resolved.id) {
                void logAppError("api/chat fallback", raw, { model: resolved.id, fallback: fb.id });
                send(JSON.stringify({ error: `The requested model is unavailable. Permitted fallback available: ${fb.id}. Please retry with an allowed model.` }));
                return;
              }
            } catch {
              // fall through to generic error
            }
          }
          const friendly = friendlyProviderError(raw);
          void logAppError("api/chat", raw, { model: (resolved as { id?: string }).id });
          void logModelUsage({
            user_id: effectiveUserId,
            model_slug: requestedSlug,
            gateway_key: usageGateway,
              source: apiUserId ? "api_key" : "chat",
            prompt_tokens: promptEstimate,
            success: false,
            error: raw,
          });
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
