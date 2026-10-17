import { getModel } from "../models";
import { createNvidiaProvider, streamChatWithTools as streamNvidia, chatWithTools as chatNvidia } from "./nvidia";
import { createGroqProvider, streamChatWithToolsGroq, chatWithToolsGroq } from "./groq";
import { createIfmProvider, streamChatWithToolsIfm, chatWithToolsIfm } from "./ifm";
import { createGatewayProvider, streamChatWithToolsGateway } from "./gateway";
import { getGatewaySecret } from "../gateways";
import type { AIProvider } from "./types";
import type { OpenAIMessage, ToolDef, ToolCallReq } from "./nvidia";

export type ProviderKey = "nvidia" | "groq" | "ifm" | "agnes" | "kira" | "codecraft" | "bynara" | "openrouter" | "ollama" | "xkiro" | "gateway";

const GATEWAY_KEYS = new Set(["kira", "codecraft", "bynara", "openrouter", "ollama", "xkiro", "gateway"]);

export function isGatewayProvider(p: string): boolean {
  return GATEWAY_KEYS.has(p);
}

function checkProvider(p: string): ProviderKey {
  if (p === "groq") return "groq";
  if (p === "ifm") return "ifm";
  if (p === "agnes") return "agnes";
  if (p === "nvidia") return "nvidia";
  if (isGatewayProvider(p)) return p as ProviderKey;
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
    case "ifm":
      return createIfmProvider(providerModelId);
    case "nvidia":
      return createNvidiaProvider(providerModelId);
    case "agnes":
      throw new Error("Agnes image models are handled via the image pipeline, not chat.");
    default:
      throw new Error(
        `Gateway provider "${provider}" needs DB credentials — use createProviderForAsync instead.`
      );
  }
}

/** Async variant that also resolves DB-stored gateway keys (kira / codecraft / bynara). */
export async function createProviderForAsync(
  provider: string,
  providerModelId: string
): Promise<{ provider: AIProvider; gatewayKey: string | null }> {
  if (!isGatewayProvider(provider)) {
    return { provider: createProviderFor(provider, providerModelId), gatewayKey: null };
  }
  // By convention provider=kira|codecraft|bynara and providerModelId=upstream model id.
  const secret = await getGatewaySecret(provider);
  if (!secret) throw new Error(`Gateway "${provider}" has no API key configured (see /admin → API Lab).`);
  return {
    provider: createGatewayProvider(secret.base_url, secret.api_key, providerModelId),
    gatewayKey: provider,
  };
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
    case "ifm":
      return streamChatWithToolsIfm(providerModelId, openAiMessages, tools, opts);
    case "nvidia":
      return streamNvidia(providerModelId, openAiMessages, tools, opts);
    case "agnes":
      throw new Error("Agnes image models are handled via the image pipeline, not chat.");
    default: {
      const secret = await getGatewaySecret(provider);
      if (!secret) throw new Error(`Gateway "${provider}" has no API key configured.`);
      const r = await streamChatWithToolsGateway(secret.base_url, secret.api_key, providerModelId, openAiMessages, tools, opts);
      return { toolCalls: r.toolCalls };
    }
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
    case "ifm":
      return chatWithToolsIfm(providerModelId, openAiMessages, tools, signal);
    case "nvidia":
      return chatNvidia(providerModelId, openAiMessages, tools, signal);
    case "agnes":
      throw new Error("Agnes image models are handled via the image pipeline, not chat.");
    default:
      throw new Error(`Gateway provider "${provider}" supports streaming only — use streamChatWithToolsFor.`);
  }
}
