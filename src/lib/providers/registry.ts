import { getModel } from "../models";
import { createNvidiaProvider } from "./nvidia";
import type { AIProvider } from "./types";

/** Resolve a model slug (e.g. "kimi-k3") to a concrete provider instance. */
export function providerFor(modelId: string): {
  provider: AIProvider;
  providerModelId: string;
} {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  switch (model.provider) {
    case "nvidia":
      return {
        provider: createNvidiaProvider(model.providerModelId),
        providerModelId: model.providerModelId,
      };
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}
