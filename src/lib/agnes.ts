/**
 * Server-side Agnes AI client (image + video generation).
 * Key stays in AGNES_API_KEY (server-only). Never import from client code.
 */

const BASE_URL = process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com/v1";
// agnesapi lives one level above /v1.
const AGNES_API_ROOT = BASE_URL.replace(/\/v1\/?$/, "");

function agnesKey(): string {
  const key = process.env.AGNES_API_KEY;
  if (!key) throw new Error("AGNES_API_KEY is not configured on the server.");
  return key;
}

function errLabel(res: Response, errText: string, what: string): string {
  if (res.status === 401 || res.status === 403)
    return "Agnes AI rejected the server credentials. Check AGNES_API_KEY.";
  if (res.status === 429) return "Agnes AI rate limit hit. Wait a moment and try again.";
  return `${what} failed (HTTP ${res.status}): ${errText.slice(0, 300)}`.trim();
}

export const AGNES_IMAGE_MODEL = "agnes-image-2.1-flash";
export const AGNES_VIDEO_MODEL = "agnes-video-2.5-flash";
export const AGNES_VIDEO_MODEL_FULL = "agnes-video-2.5";

/** Generate one image. Returns a remote URL (or inline base64 data URI). */
export async function agnesGenerateImage(opts: {
  prompt: string;
  size?: string;
  model?: string;
}): Promise<{ url: string }> {
  const prompt = opts.prompt.trim().slice(0, 2000);
  if (!prompt) throw new Error("A prompt is required.");
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agnesKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? AGNES_IMAGE_MODEL,
      prompt,
      size: opts.size ?? "1024x1024",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res, t, "Image generation"));
  }
  const j = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const first = j.data?.[0];
  if (first?.url) return { url: first.url };
  if (first?.b64_json) return { url: `data:image/png;base64,${first.b64_json}` };
  throw new Error("Image generation returned no image.");
}

export interface AgnesVideoTask {
  video_id: string;
  status: string;
  progress?: number;
  url?: string;
}

/** Create an async text-to-video task. */
export async function agnesCreateVideo(opts: {
  prompt: string;
  seconds?: string;
  size?: "720P" | "1080P" | "1K" | "2K";
  aspect_ratio?: string;
  model?: string;
}): Promise<AgnesVideoTask> {
  const prompt = opts.prompt.trim().slice(0, 2000);
  if (!prompt) throw new Error("A prompt is required.");
  const model = opts.model ?? AGNES_VIDEO_MODEL;
  // Flash only supports 720P.
  const size = model === AGNES_VIDEO_MODEL ? "720P" : (opts.size ?? "720P");
  const res = await fetch(`${BASE_URL}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agnesKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      mode: "text",
      seconds: opts.seconds ?? "5",
      size,
      aspect_ratio: opts.aspect_ratio ?? "16:9",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res, t, "Video task creation"));
  }
  const j = (await res.json()) as { video_id?: string; status?: string; progress?: number };
  if (!j.video_id) throw new Error("Video API returned no video_id.");
  return { video_id: j.video_id, status: j.status ?? "queued", progress: j.progress ?? 0 };
}

/** Poll one video task until done (throws on failure). */
export async function agnesGetVideo(videoId: string, model?: string): Promise<AgnesVideoTask> {
  const url =
    `${AGNES_API_ROOT}/agnesapi?video_id=${encodeURIComponent(videoId)}` +
    `&model_name=${encodeURIComponent(model ?? AGNES_VIDEO_MODEL)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${agnesKey()}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res, t, "Video status check"));
  }
  const j = (await res.json()) as {
    status?: string;
    progress?: number;
    url?: string;
    error?: { message?: string } | null;
  };
  if (j.status === "failed") {
    throw new Error(j.error?.message ? `Video generation failed: ${j.error.message}` : "Video generation failed.");
  }
  return { video_id: videoId, status: j.status ?? "unknown", progress: j.progress ?? 0, url: j.url };
}

/** Create + poll server-side until complete/failed/timeout. Never rejects on timeout — returns pending state. */
export async function agnesCreateAndWaitVideo(opts: {
  prompt: string;
  seconds?: string;
  size?: "720P" | "1080P" | "1K" | "2K";
  aspect_ratio?: string;
  model?: string;
  maxWaitMs?: number;
}): Promise<AgnesVideoTask> {
  const task = await agnesCreateVideo(opts);
  const deadline = Date.now() + (opts.maxWaitMs ?? 200_000);
  let delay = 2000;
  for (;;) {
    const cur = await agnesGetVideo(task.video_id, opts.model).catch(() => null);
    if (cur && (cur.status === "completed" || cur.status === "failed")) {
      if (cur.status === "failed") throw new Error("Video generation failed.");
      return cur;
    }
    if (Date.now() >= deadline) return { video_id: task.video_id, status: cur?.status ?? "in_progress", progress: cur?.progress ?? 0 };
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 8000);
  }
}
