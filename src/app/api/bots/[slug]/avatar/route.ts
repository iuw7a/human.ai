import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, toBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024;
const BUCKET = "bot-avatars";

/** POST /api/bots/[slug]/avatar — upload the Bot's avatar image (owner + Pro). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No image provided." }, { status: 400 });
    if (!ACCEPTED.includes(file.type)) {
      return Response.json({ error: "Use PNG, JPEG, WebP or GIF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Image too large — max 4 MB." }, { status: 400 });
    }
    const ext = file.type.split("/")[1] ?? "png";
    const path = `${user.id}/${bot.id}/${crypto.randomUUID()}.${ext}`;
    const admin = createAdminSupabase();
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    if (bot.avatar_path) {
      await admin.storage.from(BUCKET).remove([bot.avatar_path]).catch(() => {});
    }
    const { data, error: dbError } = await admin
      .from("bots")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", bot.id)
      .select("*")
      .single();
    if (dbError) throw dbError;
    return Response.json({ bot: toBot(data) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
