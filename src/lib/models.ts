export interface ModelConfig {
  /** Slug used in URLs, e.g. "humi1.1-speed" */
  id: string;
  /** Provider key: built-ins or DB gateway keys (kira / codecraft / bynara / gateway) */
  provider: "nvidia" | "groq" | "ifm" | "agnes" | "kira" | "codecraft" | "bynara" | "gateway" | (string & {});
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
  "humi1.1-speed": {
    id: "humi1.1-speed",
    provider: "nvidia",
    name: "humi1.1-speed",
    description: "The Human AI flagship model — fast, precise, understands images.",
    providerModelId: "meta/llama-3.2-11b-vision-instruct",
    vision: true,
    streaming: true,
    maxImageSizeMB: 8,
  },
  "humi.1-images": {
    id: "humi.1-images",
    provider: "agnes",
    name: "humi.1 images",
    description: "Text-to-image generation — describe it, get an image.",
    providerModelId: "agnes-image-2.1-flash",
    vision: false,
    streaming: false,
    maxImageSizeMB: 0,
  },
};

export const DEFAULT_MODEL_ID = "humi1.1-speed";

export function getModel(modelId: string): ModelConfig | null {
  return models[modelId] ?? null;
}

export function listModels(): ModelConfig[] {
  return Object.values(models);
}
