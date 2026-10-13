/**
 * Server-side Hugging Face Inference Providers video client.
 * Key stays in HF_TOKEN (server-only). Never import from client code.
 * Billing/credits live on the HF account — 402 means top up, not a bug.
 */

function hfToken(): string {
  const key = process.env.HF_TOKEN;
  if (!key) throw new Error("HF_TOKEN is not configured on the server.");
  return key;
}

export const HF_DEFAULT_VIDEO_MODEL = "fal-ai/fal-ai/hunyuan-video";

/**
 * Text-to-video via the HF router. Resolves to raw MP4 bytes
 * (the provider queue is polled internally by the gateway).
 */
export async function hfTextToVideo(opts: {
  prompt: string;
  providerModel?: string;
  parameters?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<Buffer> {
  const prompt = opts.prompt.trim().slice(0, 2000);
  if (!prompt) throw new Error("A prompt is required.");
  const model = (opts.providerModel ?? HF_DEFAULT_VIDEO_MODEL).trim().replace(/^\/+|\/+$/g, "");
  if (!model || model.includes("..")) throw new Error("Invalid model.");
  const url = `https://router.huggingface.co/${model}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 280_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken()}`,
        "Content-Type": "application/json",
        Accept: "video/mp4",
      },
      body: JSON.stringify({ inputs: prompt, parameters: opts.parameters ?? {} }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 402)
        throw new Error("Hugging Face billing blocked the request (402). Top up credits/billing, then retry.");
      if (res.status === 401 || res.status === 403)
        throw new Error("Hugging Face rejected the token. It needs Inference Providers permission.");
      throw new Error(`Video generation failed (HTTP ${res.status}): ${t.slice(0, 200)}`.trim());
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) throw new Error("Video provider returned no usable video.");
    return buf;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Video generation timed out.");
    throw e instanceof Error ? e : new Error("Video generation failed.");
  } finally {
    clearTimeout(timer);
  }
}
