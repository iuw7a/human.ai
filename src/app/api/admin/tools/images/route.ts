import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin";
import { agnesGenerateImage } from "@/lib/agnes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SIZES = ["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280"];

/** POST /api/admin/tools/images {prompt, size?} — admin-only text-to-image. */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json().catch(() => null)) as { prompt?: unknown; size?: unknown } | null;
    const prompt = typeof b?.prompt === "string" ? b.prompt : "";
    const size = typeof b?.size === "string" && SIZES.includes(b.size) ? b.size : "1024x1024";
    if (!prompt.trim()) return Response.json({ error: "A prompt is required." }, { status: 400 });
    const out = await agnesGenerateImage({ prompt, size });
    return Response.json({ ok: true, imageUrl: out.url, size });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
