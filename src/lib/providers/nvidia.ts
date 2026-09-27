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
