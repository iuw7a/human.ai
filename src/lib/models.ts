export interface ModelConfig {
  /** Slug used in URLs, e.g. "kimi-k3" */
  id: string;
  /** Provider key, e.g. "nvidia" or "groq" */
  provider: "nvidia" | "groq";
  /** Display name */
  name: string;
  /** Short description shown in UI */
  description: string;
  /** Actual model id sent to the provider API */
  providerModelId: string;
  vision: boolean;
  streaming: boolean;
  maxImageSizeMB: number;
}

export const models: Record<string, ModelConfig> = {
  // Public slug — neutral, no provider/model internals leak into URLs or UI.
  "human-ai": {
    id: "human-ai",
    provider: "nvidia",
    name: "Human AI",
    description: "The Human AI flagship model — fast, precise, understands images.",
    providerModelId: "meta/llama-3.2-11b-vision-instruct",
    vision: true,
    streaming: true,
    maxImageSizeMB: 8,
  },
  // Legacy slugs (existing chats/URLs keep working; same neutral display name).
  "llama-3.2-11b-vision": {
    id: "llama-3.2-11b-vision",
    provider: "nvidia",
    name: "Human AI",
    description: "The Human AI flagship model — fast, precise, understands images.",
    providerModelId: "meta/llama-3.2-11b-vision-instruct",
    vision: true,
    streaming: true,
    maxImageSizeMB: 8,
  },
  "gpt-oss-20b": {
    id: "gpt-oss-20b",
    provider: "nvidia",
    name: "Human AI",
    description: "The Human AI text model — strong reasoning, fast answers.",
    providerModelId: "openai/gpt-oss-20b",
    vision: false,
    streaming: true,
    maxImageSizeMB: 8,
  },
  "kimi-k3": {
    id: "kimi-k3",
    provider: "nvidia",
    name: "Human AI",
    description: "Human AI flagship model — fast, precise, vision-capable.",
    providerModelId:
      process.env.NVIDIA_MODEL_ID ?? "moonshotai/kimi-k3",
    vision: true,
    streaming: true,
    maxImageSizeMB: 8,
  },
};

export const DEFAULT_MODEL_ID = "human-ai";

export function getModel(modelId: string): ModelConfig | null {
  return models[modelId] ?? null;
}

export function listModels(): ModelConfig[] {
  return Object.values(models);
}
