import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin";
import { agnesCreateAndWaitVideo, agnesGetVideo } from "@/lib/agnes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SIZES = ["720P", "1080P", "1K", "2K"] as const;
const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const SECONDS = ["4", "5", "6", "8", "12"];

/** GET /api/admin/tools/videos?video_id= — poll a running task (admin-only). */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const videoId = req.nextUrl.searchParams.get("video_id") ?? "";
  if (!videoId) return Response.json({ error: "video_id required." }, { status: 400 });
  try {
    const cur = await agnesGetVideo(videoId);
    return Response.json({ ok: true, ...cur });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** POST /api/admin/tools/videos {prompt, seconds?, size?, aspect_ratio?} — create + wait (admin-only). */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json().catch(() => null)) as {
      prompt?: unknown; seconds?: unknown; size?: unknown; aspect_ratio?: unknown;
    } | null;
    const prompt = typeof b?.prompt === "string" ? b.prompt : "";
    if (!prompt.trim()) return Response.json({ error: "A prompt is required." }, { status: 400 });
    const seconds = typeof b?.seconds === "string" && SECONDS.includes(b.seconds) ? b.seconds : "5";
    const size = (typeof b?.size === "string" && (SIZES as readonly string[]).includes(b.size) ? b.size : "720P") as typeof SIZES[number];
    const aspect_ratio = typeof b?.aspect_ratio === "string" && RATIOS.includes(b.aspect_ratio) ? b.aspect_ratio : "16:9";
    const out = await agnesCreateAndWaitVideo({ prompt, seconds, size, aspect_ratio });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed.";
    // Same key works for images but not videos → the key lacks video scope/quota.
    const hinted =
      /rejected the server credentials|401/.test(msg)
        ? `${msg} (If images work but videos don't, this key has no video permission — create a key with video access.)`
        : msg;
    return Response.json({ error: hinted }, { status: 500 });
  }
}
