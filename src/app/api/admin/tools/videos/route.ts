import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin";
import { AGNES_VIDEO_MODEL, AGNES_VIDEO_MODEL_FULL, agnesCreateAndWaitVideo, agnesGetVideo } from "@/lib/agnes";
import { HF_DEFAULT_VIDEO_MODEL, hfTextToVideo } from "@/lib/hfvideo";
import { j2vCreateAndWait, j2vGetMovie } from "@/lib/json2video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SIZES = ["720P", "1080P", "1K", "2K"] as const;
const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const SECONDS = ["4", "5", "6", "8", "12"];

/** GET /api/admin/tools/videos?video_id=&provider= — poll a running task (admin-only).
 *  provider "agnes" (default) uses the Agnes video id, "json2video" the J2V project id. */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const videoId = req.nextUrl.searchParams.get("video_id") ?? "";
  const provider = req.nextUrl.searchParams.get("provider") ?? "agnes";
  if (!videoId) return Response.json({ error: "video_id required." }, { status: 400 });
  try {
    if (provider === "json2video") {
      const cur = await j2vGetMovie(videoId);
      const status =
        cur.status === "done" ? "completed" : cur.status === "error" || cur.status === "timeout" ? "failed" : "in_progress";
      return Response.json({ ok: true, video_id: videoId, status, url: cur.url ?? undefined });
    }
    const cur = await agnesGetVideo(videoId);
    return Response.json({ ok: true, ...cur });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** POST /api/admin/tools/videos {prompt, backend?, seconds?, size?, aspect_ratio?, hfModel?}.
 *  backend "agnes" (default): async task, waits then returns JSON (or pending + videoId).
 *  backend "hf": Hugging Face Inference Providers, returns raw video/mp4 bytes.
 *  backend "json2video": narrated caption movie, waits then returns JSON (or pending + videoId). */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json().catch(() => null)) as {
      prompt?: unknown; backend?: unknown; seconds?: unknown; size?: unknown; aspect_ratio?: unknown; hfModel?: unknown; model?: unknown;
    } | null;
    const prompt = typeof b?.prompt === "string" ? b.prompt : "";
    if (!prompt.trim()) return Response.json({ error: "A prompt is required." }, { status: 400 });
    if (b?.backend === "hf") {
      const hfModel = typeof b?.hfModel === "string" && b.hfModel.trim() ? b.hfModel.trim() : HF_DEFAULT_VIDEO_MODEL;
      const mp4 = await hfTextToVideo({ prompt, providerModel: hfModel });
      return new Response(new Uint8Array(mp4), {
        headers: { "Content-Type": "video/mp4", "Cache-Control": "no-store", "Content-Length": String(mp4.length) },
      });
    }
    if (b?.backend === "json2video") {
      const rawSeconds = Number(b?.seconds);
      const seconds = [5, 10, 15, 30].includes(rawSeconds) ? rawSeconds : 10;
      const out = await j2vCreateAndWait({ prompt, seconds });
      if (out.status === "done" && out.url) {
        return Response.json({ ok: true, video_id: out.project, status: "completed", url: out.url });
      }
      if (out.status === "error" || out.status === "timeout") {
        throw new Error(out.message ? `Video generation failed: ${out.message}` : "Video generation failed.");
      }
      return Response.json({ ok: true, video_id: out.project, status: "in_progress", provider: "json2video" });
    }
    const seconds = typeof b?.seconds === "string" && SECONDS.includes(b.seconds) ? b.seconds : "5";
    const size = (typeof b?.size === "string" && (SIZES as readonly string[]).includes(b.size) ? b.size : "720P") as typeof SIZES[number];
    const aspect_ratio = typeof b?.aspect_ratio === "string" && RATIOS.includes(b.aspect_ratio) ? b.aspect_ratio : "16:9";
    const model = b?.model === "full" ? AGNES_VIDEO_MODEL_FULL : AGNES_VIDEO_MODEL;
    const out = await agnesCreateAndWaitVideo({ prompt, seconds, size, aspect_ratio, model });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed.";
    let hinted = msg;
    let isQueueFull = false;

    if (/video_queue_full|queue is full|503/i.test(msg)) {
      isQueueFull = true;
      hinted = `سيرفر Agnes لتوليد الفيديو ممتلئ حالياً بسبب ضغط الطلبات العالمي (Video queue is full). يرجى إعادة المحاولة بعد دقيقة، أو استخدام المحرك البديل (Hugging Face) أو توليد صورة.`;
    } else if (/rejected the server credentials|401/.test(msg)) {
      hinted = `${msg} (If images work but videos don't, this key has no video permission — create a key with video access.)`;
    }

    return Response.json(
      { error: hinted, code: isQueueFull ? "video_queue_full" : "failed", originalError: msg },
      { status: isQueueFull ? 503 : 500 }
    );
  }
}
