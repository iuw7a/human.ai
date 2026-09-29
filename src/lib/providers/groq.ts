import type { AIProvider, ChatMessageInput } from "./types";
import { toOpenAIMessage, type OpenAIMessage, type ToolDef, type ToolCallReq } from "./nvidia";

const BASE_URL =
  process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";

function groqKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured on the server.");
  return apiKey;
}

function errLabel(res: Response, errText: string): string {
  return `Groq API error ${res.status}: ${errText.slice(0, 500)}`;
}

/**
 * Streaming chat with native function calling (OpenAI-compatible SSE).
 * Text streams via onToken; requested tool calls are aggregated and returned.
 * Reasoning deltas (reasoning models) are skipped — only final content streams.
 */
export async function streamChatWithToolsGroq(
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  opts: { onToken?: (token: string) => void; signal?: AbortSignal } = {}
): Promise<{ toolCalls: ToolCallReq[] }> {
  const timeout = AbortSignal.timeout(60_000);
  const combined = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: openAiMessages,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 4096,
      stream: true,
    }),
    signal: combined,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(errLabel(res, errText));
  }

  const acc = new Map<number, { id: string; name: string; args: string }>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) await opts.onToken?.(delta.content);
        for (const tc of delta?.tool_calls ?? []) {
          const cur = acc.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          acc.set(tc.index, cur);
        }
      } catch {
        // ignore keep-alive / partial frames
      }
    }
  }

  const toolCalls: ToolCallReq[] = [...acc.values()]
    .filter((t) => t.name)
    .map((t, i) => ({ id: t.id || `call_${i}`, name: t.name, arguments: t.args || "{}" }));
  return { toolCalls };
}

async function requestGroq(
  providerModelId: string,
  messages: ChatMessageInput[],
  stream: boolean,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const timeout = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: toOpenAIMessage(m).content,
      })),
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 4096,
      stream,
    }),
    signal: combined,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errLabel(res, errText));
  }
  if (!stream || !res.body) {
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? "";
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = json.choices?.[0]?.delta?.content ?? "";
        if (token) {
          full += token;
          await onToken?.(token);
        }
      } catch {
        // ignore keep-alive / partial frames
      }
    }
  }
  return full;
}

export function createGroqProvider(providerModelId: string): AIProvider {
  return {
    key: "groq",
    chat: (messages, opts) =>
      requestGroq(providerModelId, messages, false, undefined, opts?.signal),
    stream: (messages, opts) =>
      requestGroq(providerModelId, messages, true, opts?.onToken, opts?.signal),
  };
}

/** Non-streaming chat with native function calling. Returns text + tool calls. */
export async function chatWithToolsGroq(
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: ToolCallReq[] }> {
  const timeout = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: openAiMessages,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: 4096,
      stream: false,
    }),
    signal: combined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errLabel(res, errText));
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  return {
    text: msg?.content ?? "",
    toolCalls: (msg?.tool_calls ?? []).map((tc, i) => ({
      id: tc.id || `call_${i}`,
      name: tc.function.name,
      arguments: tc.function.arguments || "{}",
    })),
  };
}
