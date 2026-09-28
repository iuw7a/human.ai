import type { AIProvider, ChatMessageInput } from "./types";

const BASE_URL =
  process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

function toOpenAIContent(msg: ChatMessageInput) {
  if (!msg.images || msg.images.length === 0) return msg.content;
  return [
    { type: "text", text: msg.content || "Describe this image." },
    ...msg.images.map((img) => ({
      type: "image_url",
      image_url: { url: img.url },
    })),
  ];
}

export type OpenAIMessage = {
  role: string;
  content?: string | Array<Record<string, unknown>> | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export function toOpenAIMessage(m: ChatMessageInput): OpenAIMessage {
  return { role: m.role, content: toOpenAIContent(m) as OpenAIMessage["content"] };
}

export interface ToolDef {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: Record<string, any>;
}

export interface ToolCallReq {
  id: string;
  name: string;
  arguments: string;
}

interface StreamToolOptions {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

/**
 * Streaming chat with native function calling. Text streams via onToken;
 * requested tool calls are aggregated and returned (not executed here).
 */
export async function streamChatWithTools(
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  opts: StreamToolOptions = {}
): Promise<{ toolCalls: ToolCallReq[] }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");

  const timeout = AbortSignal.timeout(60_000);
  const combined = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`NVIDIA API error ${res.status}: ${errText.slice(0, 500)}`);
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

async function requestNvidia(
  providerModelId: string,
  messages: ChatMessageInput[],
  stream: boolean,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");

  // Never hang the UI forever if the provider stalls.
  const timeout = AbortSignal.timeout(60_000);
  const combined = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: toOpenAIContent(m),
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
    throw new Error(`NVIDIA API error ${res.status}: ${errText.slice(0, 500)}`);
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

export function createNvidiaProvider(providerModelId: string): AIProvider {
  return {
    key: "nvidia",
    chat: (messages, opts) =>
      requestNvidia(providerModelId, messages, false, undefined, opts?.signal),
    stream: (messages, opts) =>
      requestNvidia(providerModelId, messages, true, opts?.onToken, opts?.signal),
  };
}
