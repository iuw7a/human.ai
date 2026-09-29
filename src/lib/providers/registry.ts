import { getModel } from "../models";
import { createNvidiaProvider, streamChatWithTools as streamNvidia, chatWithTools as chatNvidia } from "./nvidia";
import { createGroqProvider, streamChatWithToolsGroq, chatWithToolsGroq } from "./groq";
import type { AIProvider } from "./types";
import type { OpenAIMessage, ToolDef, ToolCallReq } from "./nvidia";

export type ProviderKey = "nvidia" | "groq";

function checkProvider(p: string): ProviderKey {
  if (p === "groq") return "groq";
  if (p === "nvidia") return "nvidia";
  throw new Error(`Unsupported provider: ${p}`);
}

/** Resolve a model slug (e.g. "kimi-k3") to a concrete provider instance. */
export function providerFor(modelId: string): {
  provider: AIProvider;
  providerModelId: string;
} {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return {
    provider: createProviderFor(model.provider, model.providerModelId),
    providerModelId: model.providerModelId,
  };
}

/** Provider instance for an explicit provider key + model id (DB-backed models). */
export function createProviderFor(provider: string, providerModelId: string): AIProvider {
  switch (checkProvider(provider)) {
    case "groq":
      return createGroqProvider(providerModelId);
    case "nvidia":
      return createNvidiaProvider(providerModelId);
  }
}

/** Streaming function-calling chat, routed to the model's provider. */
export async function streamChatWithToolsFor(
  provider: string,
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  opts: { onToken?: (token: string) => void; signal?: AbortSignal } = {}
): Promise<{ toolCalls: ToolCallReq[] }> {
  switch (checkProvider(provider)) {
    case "groq":
      return streamChatWithToolsGroq(providerModelId, openAiMessages, tools, opts);
    case "nvidia":
      return streamNvidia(providerModelId, openAiMessages, tools, opts);
  }
}

/** Non-streaming function-calling chat, routed to the model's provider. */
export async function chatWithToolsFor(
  provider: string,
  providerModelId: string,
  openAiMessages: OpenAIMessage[],
  tools: ToolDef[],
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: ToolCallReq[] }> {
  switch (checkProvider(provider)) {
    case "groq":
      return chatWithToolsGroq(providerModelId, openAiMessages, tools, signal);
    case "nvidia":
      return chatNvidia(providerModelId, openAiMessages, tools, signal);
  }
}
