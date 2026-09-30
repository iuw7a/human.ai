import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 4;
const BUCKET = "bot-avatars";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Sync bots.avatar_path to the lowest-position image (or null). */
async function syncPrimary(admin: ReturnType<typeof createAdminSupabase>, botId: string) {
  const { data } = await admin
    .from("bot_images")
    .select("storage_path")
    .eq("bot_id", botId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  await admin
    .from("bots")
    .update({ avatar_path: data?.storage_path ?? null, updated_at: new Date().toISOString() })
    .eq("id", botId);
}

/** GET /api/bots/[slug]/images — gallery, primary first (owner + Pro). */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bot_images")
    .select("id,storage_path,position,created_at")
    .eq("bot_id", bot.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return Response.json({
    images: (data ?? []).map((r, i) => ({ id: r.id, url: publicUrl(r.storage_path), primary: i === 0 })),
  });
}

/** POST /api/bots/[slug]/images — upload 1..n images, max 4 total (owner + Pro). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const admin = createAdminSupabase();
    const { data: existing } = await admin.from("bot_images").select("id").eq("bot_id", bot.id);
    const slotsLeft = MAX_IMAGES - (existing ?? []).length;
    if (slotsLeft <= 0) {
      return Response.json({ error: `Max ${MAX_IMAGES} images per Bot. Remove one first.` }, { status: 400 });
    }
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, slotsLeft);
    if (files.length === 0) return Response.json({ error: "No images provided." }, { status: 400 });

    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const { data: current } = await admin
      .from("bot_images")
      .select("position")
      .eq("bot_id", bot.id)
      .order("position", { ascending: false })
      .limit(1);
    let pos = (current?.[0]?.position ?? -1) + 1;

    const saved: { id: string; url: string }[] = [];
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        return Response.json({ error: `Unsupported type ${file.type}. Use PNG, JPEG, WebP or GIF.` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return Response.json({ error: `"${file.name}" too large — max 4 MB per image.` }, { status: 400 });
      }
      if (file.size === 0) {
        return Response.json({ error: `"${file.name}" is empty.` }, { status: 400 });
      }
      const ext = file.type.split("/")[1] ?? "png";
      const path = `${user.id}/${bot.id}/${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const { data: row, error: dbError } = await admin
        .from("bot_images")
        .insert({ bot_id: bot.id, user_id: user.id, storage_path: path, position: pos++ })
        .select("id,storage_path")
        .single();
      if (dbError) {
        await admin.storage.from(BUCKET).remove([path]).catch(() => {});
        throw dbError;
      }
      saved.push({ id: row.id, url: publicUrl(row.storage_path) });
    }
    await syncPrimary(admin, bot.id);
    return Response.json({ images: saved });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}

/** PATCH /api/bots/[slug]/images {make_primary: id} (owner + Pro). */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const { make_primary } = (await req.json()) as { make_primary?: string };
  if (!make_primary) return Response.json({ error: "make_primary required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: rows } = await admin
    .from("bot_images")
    .select("id")
    .eq("bot_id", bot.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const ids = (rows ?? []).map((r) => r.id as string);
  if (!ids.includes(make_primary)) return Response.json({ error: "Image not found." }, { status: 404 });
  const ordered = [make_primary, ...ids.filter((id) => id !== make_primary)];
  for (let i = 0; i < ordered.length; i++) {
    await admin.from("bot_images").update({ position: i }).eq("id", ordered[i]);
  }
  await syncPrimary(admin, bot.id);
  return Response.json({ ok: true });
}

/** DELETE /api/bots/[slug]/images?id= — remove one (owner + Pro). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("bot_images")
    .select("storage_path")
    .eq("id", id)
    .eq("bot_id", bot.id)
    .single();
  if (!row) return Response.json({ error: "Image not found." }, { status: 404 });
  await admin.from("bot_images").delete().eq("id", id);
  await admin.storage.from(BUCKET).remove([row.storage_path as string]).catch(() => {});
  await syncPrimary(admin, bot.id);
  return Response.json({ ok: true });
}
