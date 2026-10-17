import type { AIProvider, ChatMessageInput } from "./types";
import type { OpenAIMessage, ToolDef, ToolCallReq } from "./nvidia";
import { toOpenAIMessage } from "./nvidia";

function contentOf(msg: ChatMessageInput) {
  if (!msg.images || msg.images.length === 0) return msg.content;
  return [
    { type: "text", text: msg.content || "Describe this image." },
    ...msg.images.map((img) => ({ type: "image_url", image_url: { url: img.url } })),
  ];
}

async function sseStream(
  baseUrl: string,
  apiKey: string,
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[] | null,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<{ toolCalls: ToolCallReq[]; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const timeout = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: openAiMessages,
      ...(tools && tools.length > 0
        ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
      temperature: 0.6,
      max_tokens: 4096,
      stream: true,
    }),
    signal: combined,
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gateway API error ${res.status}: ${errText.slice(0, 500)}`);
  }
  const acc = new Map<number, { id: string; name: string; args: string }>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
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
          choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        if (json.usage) {
          usage = {
            prompt_tokens: json.usage.prompt_tokens ?? 0,
            completion_tokens: json.usage.completion_tokens ?? 0,
            total_tokens: json.usage.total_tokens ?? 0,
          };
        }
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) await onToken?.(delta.content);
        for (const tc of delta?.tool_calls ?? []) {
          const cur = acc.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          acc.set(tc.index, cur);
        }
      } catch {
        // ignore keep-alive
      }
    }
  }
  const toolCalls = [...acc.values()].filter((t) => t.name).map((t, i) => ({ id: t.id || `call_${i}`, name: t.name, arguments: t.args || "{}" }));
  return { toolCalls, usage };
}

/** Generic OpenAI-compatible gateway provider (Kira / CodeCraft / NaraRouter / custom). */
export function createGatewayProvider(baseUrl: string, apiKey: string, providerModelId: string): AIProvider {
  const base = baseUrl.replace(/\/$/, "");
  return {
    key: "gateway" as unknown as AIProvider["key"],
    chat: async (messages) => {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: providerModelId, messages: messages.map((m) => ({ role: m.role, content: contentOf(m) })), temperature: 0.6, max_tokens: 4096, stream: false }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Gateway API error ${res.status}: ${t.slice(0, 500)}`);
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return j.choices?.[0]?.message?.content ?? "";
    },
    stream: async (messages, opts) => {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ model: providerModelId, messages: messages.map((m) => ({ role: m.role, content: contentOf(m) })), temperature: 0.6, max_tokens: 4096, stream: true }),
        signal: opts?.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(`Gateway API error ${res.status}: ${t.slice(0, 500)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
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
            const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const tok = j.choices?.[0]?.delta?.content ?? "";
            if (tok) {
              full += tok;
              await opts?.onToken?.(tok);
            }
          } catch {
            // ignore
          }
        }
      }
      return full;
    },
  };
}

export async function streamChatWithToolsGateway(
  baseUrl: string,
  apiKey: string,
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  opts: { onToken?: (token: string) => void; signal?: AbortSignal } = {}
) {
  return sseStream(baseUrl.replace(/\/$/, ""), apiKey, providerModelId, openAiMessages, tools, opts.onToken, opts.signal);
}

export { toOpenAIMessage };
