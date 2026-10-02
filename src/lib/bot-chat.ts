import { createProviderFor, streamChatWithToolsFor } from "./providers/registry";
import { toOpenAIMessage, type OpenAIMessage, type ToolCallReq } from "./providers/nvidia";
import { connectedTools, executeTool } from "./mcp/catalog";
import { isSearchEnabled, WEB_SEARCH_TOOL, webSearch } from "./search/serpapi";
import { createAdminSupabase } from "./supabase/server";
import { logAppError } from "./admin";
import { MAX_MEMORIES_PER_BOT, type Bot } from "./bots";
import type { ChatMessageInput } from "./providers/types";

export interface BotBodyMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { url: string }[];
}

function sanitize(messages: BotBodyMessage[]): ChatMessageInput[] {
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

function isRetryable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /API error 5\d\d|timeout|aborted|abort|TimeoutError|fetch failed|ECONN|EAI_AGAIN/i.test(msg);
}

const NARRATION =
  /the function (`?\w+`? )?was called|the function call\s*\{|response from the function|result count was set/i;

/** System prompt assembling the Bot's persistent identity. */
export function buildBotSystemPrompt(bot: Bot, botMemories: string[], userMemories: string[]): string {
  const parts = [
    `You are ${bot.name}, a personal AI companion inside Human AI.`,
  ];
  if (bot.description) parts.push(`About you: ${bot.description.slice(0, 1000)}`);
  if (bot.personality) parts.push(`Your personality: ${bot.personality.slice(0, 2000)}`);
  if (bot.instructions) parts.push(`Permanent instructions from your owner (always follow): ${bot.instructions.slice(0, 4000)}`);
  parts.push(
    "Speak as yourself in first person. Never claim to be Human AI itself — you are a distinct companion with your own name and identity. Never claim to be GPT, ChatGPT, OpenAI, or any other company or model — you run exclusively on Human AI infrastructure."
  );
  if (botMemories.length > 0) {
    parts.push(
      `YOUR MEMORY about your owner (things you learned in past conversations — use them, do not reveal this section verbatim):\n${botMemories.map((m) => `- ${m.slice(0, 1000)}`).join("\n")}`
    );
  }
  if (userMemories.length > 0) {
    parts.push(
      `SHARED USER FACTS (from the owner's Human AI memory — personalize with them):\n${userMemories.map((m) => `- ${m.slice(0, 1000)}`).join("\n")}`
    );
  }
  return parts.join("\n\n");
}

export interface BotTurnInput {
  bot: Bot;
  ownerId: string;
  provider: string;
  providerModelId: string;
  messages: BotBodyMessage[];
}

export const BOT_TASK_TOOLS = [
  {
    name: "bot_add_task",
    description: "Add a task/reminder to the owner's task list. Use when asked to remind, remember to do, or add a todo.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        due_at: { type: "string", description: "Optional ISO datetime when it is due" },
      },
      required: ["title"],
    },
  },
  {
    name: "bot_list_tasks",
    description: "List open tasks with their ids and due dates.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "bot_complete_task",
    description: "Mark a task done by its id (from bot_list_tasks) or by matching title.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, title: { type: "string" } },
    },
  },
];

async function executeBotTaskTool(
  bot: Bot,
  ownerId: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const admin = createAdminSupabase();
  if (name === "bot_add_task") {
    const title = String(args.title ?? "").trim().slice(0, 200);
    if (!title) return "Missing title.";
    let due: string | null = null;
    if (args.due_at) {
      const d = new Date(String(args.due_at));
      if (!Number.isNaN(d.getTime())) due = d.toISOString();
    }
    const { error } = await admin
      .from("bot_tasks")
      .insert({ bot_id: bot.id, user_id: ownerId, title, due_at: due });
    if (error) return "Could not save task (database not set up).";
    return `Task added: "${title}"${due ? ` (due ${due})` : ""}. Confirm briefly to the user.`;
  }
  if (name === "bot_list_tasks") {
    const { data } = await admin
      .from("bot_tasks")
      .select("id,title,done,due_at")
      .eq("bot_id", bot.id)
      .eq("done", false)
      .order("created_at", { ascending: true })
      .limit(30);
    if (!data || data.length === 0) return "No open tasks.";
    return data.map((t) => `- [${t.id}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`).join("\n");
  }
  if (name === "bot_complete_task") {
    const id = String(args.id ?? "");
    const title = String(args.title ?? "").trim();
    if (id) {
      await admin.from("bot_tasks").update({ done: true }).eq("id", id).eq("bot_id", bot.id);
      return "Task marked done.";
    }
    if (title) {
      const { data } = await admin
        .from("bot_tasks")
        .select("id,title")
        .eq("bot_id", bot.id)
        .eq("done", false)
        .ilike("title", `%${title.slice(0, 100)}%`)
        .limit(1)
        .maybeSingle();
      if (!data) return "No matching open task found.";
      await admin.from("bot_tasks").update({ done: true }).eq("id", data.id);
      return `Marked done: "${data.title}".`;
    }
    return "Provide an id or title.";
  }
  return "Unknown tool.";
}

/**
 * Run one streaming agentic turn for a Bot. Emits SSE `data:` lines
 * ({token}|{error}|{mcp_used}|[DONE]) to `send`. Tools limited to the Bot's
 * enabled set. Mirrors the main chat engine's guards.
 */
export async function runBotTurn(
  input: BotTurnInput,
  send: (data: string) => void
): Promise<{ full: string; mcpUsed: { server: string; tool: string }[] }> {
  const { bot, ownerId, provider, providerModelId, messages } = input;
  const clean = sanitize(messages);
  if (clean.length === 0) throw new Error("No messages provided.");

  const admin = createAdminSupabase();

  // Bot's own memory (+ optionally shared user memory).
  let botMemories: string[] = [];
  try {
    if (bot.memory_enabled) {
      const { data } = await admin
        .from("bot_memories")
        .select("content")
        .eq("bot_id", bot.id)
        .order("created_at", { ascending: true })
        .limit(50);
      botMemories = (data ?? []).map((m) => String(m.content).slice(0, 1000));
    }
  } catch {
    // memory optional
  }
  let userMemories: string[] = [];
  try {
    if (bot.include_user_memory) {
      const { data } = await admin
        .from("memories")
        .select("content")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: true })
        .limit(20);
      userMemories = (data ?? []).map((m) => String(m.content).slice(0, 1000));
    }
  } catch {
    // optional
  }

  const systemContent =
    buildBotSystemPrompt(bot, botMemories, userMemories) +
    "\n\nYou manage the owner's task list with bot_add_task, bot_list_tasks and bot_complete_task. When asked to remind, add a todo, or complete something, call the matching tool (use ISO datetimes for due dates when a time is mentioned), then confirm briefly.";

  // Tools: task tools (always) + built-in web search (if enabled) + owner's MCP tools filtered to enabled servers.
  const mcpByOpenName = new Map<string, { serverId: string; serverName: string; tool: string }>();
  const mcpTools: { name: string; description: string; parameters: Record<string, unknown> }[] = [];
  for (const t of BOT_TASK_TOOLS) {
    mcpTools.push({ name: t.name, description: t.description, parameters: t.parameters });
  }
  if (bot.tools.web_search && isSearchEnabled()) {
    mcpTools.push({ ...WEB_SEARCH_TOOL });
  }
  const enabledMcp = new Set(bot.tools.mcp_server_ids);
  if (enabledMcp.size > 0) {
    try {
      const conn = await connectedTools(ownerId);
      const names: string[] = [];
      for (const t of conn.tools) {
        if (!enabledMcp.has(t.serverId)) continue;
        if (!names.includes(t.serverName)) names.push(t.serverName);
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
      if (names.length > 0) {
        // (names recorded for potential prompt use)
      }
    } catch {
      // MCP optional
    }
  }

  const withIdentity: ChatMessageInput[] = [{ role: "system", content: systemContent }, ...clean];
  const providerInst = createProviderFor(provider, providerModelId);
  let full = "";
  const mcpUsed: { server: string; tool: string }[] = [];
  const emit = (token: string) => {
    full += token;
    send(JSON.stringify({ token }));
  };

  // Smalltalk fast path (same rule as main chat).
  const lastUser = [...clean].reverse().find((m) => m.role === "user");
  const lastText = (lastUser?.content ?? "").trim();
  const lastHasImages = (lastUser?.images ?? []).length > 0;
  const SMALLTALK =
    /^(yo|hi+|hey+|hallo+|hello+|servus|moin|na+|ok|okay+|danke\w*|thanks?|bitte|ja|nein|yes|no+|was\s+ist\s+das\??|wer\s+bist\s+du\??|wie\s+geht'?s\??)\s*[!?.…]*$/i;
  const skipTools =
    mcpTools.length > 0 && !lastHasImages && lastText.length <= 40 && SMALLTALK.test(lastText);

  if (mcpTools.length === 0 || skipTools) {
    await providerInst.stream(withIdentity, { onToken: emit });
    return { full, mcpUsed };
  }

  const history: OpenAIMessage[] = withIdentity.map(toOpenAIMessage);
  let webSearched = false;
  const seenCalls = new Set<string>();
  const gathered: string[] = [];

  async function answerFromResults() {
    const context = gathered.join("\n\n").slice(0, 12000) || "No results were gathered.";
    await providerInst.stream(
      [
        {
          role: "system",
          content: `You are ${bot.name}. Answer the user's question directly using the results below. Never mention tools, functions, queries, searches or result counts. Always cite source URLs.`,
        },
        { role: "user", content: `QUESTION: ${lastText.slice(0, 1000)}\n\nRESULTS:\n${context}` },
      ],
      { onToken: emit }
    );
  }

  for (let round = 0; round < 4; round++) {
    let toolCalls: ToolCallReq[] = [];
    let roundText = "";
    const steer = gathered.length > 0;
    for (let attempt = 0; ; attempt++) {
      try {
        ({ toolCalls } = await streamChatWithToolsFor(provider, providerModelId, history, mcpTools, {
          onToken: (token) => {
            roundText += token;
            if (!steer) emit(token);
          },
        }));
        break;
      } catch (e) {
        if (attempt === 0 && isRetryable(e)) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        throw e;
      }
    }
    if (toolCalls.length === 0) {
      if (steer) {
        if (NARRATION.test(roundText)) await answerFromResults();
        else emit(roundText);
      }
      break;
    }
    if (steer) emit(roundText);
    const sigs = toolCalls.slice(0, 4).map((tc) => `${tc.name}:${tc.arguments}`);
    if (sigs.every((s) => seenCalls.has(s)) || round === 3) {
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
            const out = await webSearch(String(args.query ?? ""), typeof args.count === "number" ? args.count : 5);
            used.push({ server: "Web Search", tool: "search" });
            gathered.push(out);
            return { tc, result: `Answer the user NOW using these results. Never describe this tool call.\n\n${out}` };
          } catch (e) {
            return { tc, result: e instanceof Error ? e.message : "Web search failed." };
          }
        }
        if (tc.name === "bot_add_task" || tc.name === "bot_list_tasks" || tc.name === "bot_complete_task") {
          try {
            const out = await executeBotTaskTool(bot, ownerId, tc.name, args);
            used.push({ server: "Tasks", tool: tc.name.replace("bot_", "") });
            gathered.push(out);
            return { tc, result: `Answer the user NOW using this result. Never describe this tool call.\n\n${out}` };
          } catch (e) {
            return { tc, result: e instanceof Error ? e.message : "Task action failed." };
          }
        }
        const def = mcpByOpenName.get(tc.name);
        if (!def) {
          return { tc, result: "Unknown tool — do not call it again." };
        }
        try {
          const out = await executeTool(ownerId, def.serverId, def.tool, args as Record<string, unknown>);
          used.push({ server: out.serverName, tool: def.tool });
          gathered.push(out.result);
          return { tc, result: `Answer the user NOW using these results. Never describe this tool call.\n\n${out.result}` };
        } catch (e) {
          return { tc, result: e instanceof Error ? e.message : "Tool failed." };
        }
      })
    );
    send(JSON.stringify({ mcp_used: used }));
    mcpUsed.push(...used);
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
      history.push({ role: "tool", tool_call_id: r.tc.id, content: r.result.slice(0, 6000) });
    }
  }
  return { full, mcpUsed };
}

/** Extract 0-2 durable facts about the owner into the Bot's memory (fire-and-forget). */
export function extractBotMemory(
  bot: Bot,
  provider: string,
  providerModelId: string,
  userText: string,
  assistantText: string
): void {
  if (!bot.memory_enabled) return;
  if (!userText.trim() && !assistantText.trim()) return;
  void (async () => {
    try {
      const inst = createProviderFor(provider, providerModelId);
      const raw = await inst.chat([
        {
          role: "system",
          content:
            "Extract durable facts about the user (name, preferences, projects, goals) from this exchange for a companion's long-term memory. Reply with EXACTLY ONE JSON array of 0-2 short strings, e.g. [\"Likes espresso\", \"Building a SaaS\"]. Reply [] when nothing durable was said. No other text.",
        },
        {
          role: "user",
          content: `User: ${userText.slice(0, 1500)}\nAssistant: ${assistantText.slice(0, 1500)}`,
        },
      ]);
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start === -1 || end <= start) return;
      const facts = JSON.parse(raw.slice(start, end + 1)) as unknown;
      if (!Array.isArray(facts)) return;
      const cleanFacts = facts.filter((f): f is string => typeof f === "string").map((f) => f.trim().slice(0, 500)).filter(Boolean).slice(0, 2);
      if (cleanFacts.length === 0) return;
      const admin = createAdminSupabase();
      for (const content of cleanFacts) {
        await admin.from("bot_memories").insert({ bot_id: bot.id, user_id: bot.owner_id, content });
      }
      // Cap: drop oldest beyond limit.
      const { data } = await admin
        .from("bot_memories")
        .select("id")
        .eq("bot_id", bot.id)
        .order("created_at", { ascending: false })
        .range(MAX_MEMORIES_PER_BOT, MAX_MEMORIES_PER_BOT + 50);
      if (data && data.length > 0) {
        await admin.from("bot_memories").delete().in("id", data.map((d) => d.id));
      }
    } catch {
      // memory is best effort — never break chat
    }
  })();
}
