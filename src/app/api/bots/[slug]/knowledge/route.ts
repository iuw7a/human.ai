import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "bot-knowledge";
const ACCEPTED = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_BYTES = 10 * 1024 * 1024;

/** GET /api/bots/[slug]/knowledge — list entries (owner + Pro). */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("bot_knowledge")
      .select("id,kind,title,created_at")
      .eq("bot_id", bot.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return Response.json({ entries: data ?? [] });
  } catch {
    return Response.json({ entries: [] });
  }
}

/**
 * POST /api/bots/[slug]/knowledge — add text/url/file (owner + Pro).
 * JSON {kind:'text'|'url', title, content} or multipart {file, title}.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  try {
    const ct = req.headers.get("content-type") ?? "";
    let kind = "text";
    let title = "";
    let content = "";
    let filePath: string | null = null;
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "No file provided." }, { status: 400 });
      if (!ACCEPTED.includes(file.type)) return Response.json({ error: "Use TXT, Markdown, PDF or Word." }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "File too large — max 10 MB." }, { status: 400 });
      const ext = (file.name.split(".").pop() ?? "bin").slice(0, 8);
      filePath = `${user.id}/${bot.id}/${crypto.randomUUID()}.${ext}`;
      await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upError } = await admin.storage.from(BUCKET).upload(filePath, bytes, {
        contentType: file.type,
        upsert: false,
      });
      if (upError) throw new Error(`Upload failed: ${upError.message}`);
      kind = "file";
      title = (String(form.get("title") ?? file.name).trim().slice(0, 120) || file.name).slice(0, 120);
    } else {
      const b = (await req.json().catch(() => null)) as
        | { kind?: string; title?: string; content?: string }
        | null;
      kind = b?.kind === "url" ? "url" : "text";
      title = (b?.title ?? "").trim().slice(0, 120);
      content = (b?.content ?? "").trim().slice(0, 20000);
      if (!content && !title) return Response.json({ error: "Content required." }, { status: 400 });
      if (!title) title = kind === "url" ? content.slice(0, 120) : content.slice(0, 60) || "Note";
    }
    const { data, error } = await admin
      .from("bot_knowledge")
      .insert({ bot_id: bot.id, user_id: user.id, kind, title, content, file_path: filePath })
      .select("id,kind,title,created_at")
      .single();
    if (error) throw error;
    return Response.json({ entry: data });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not add knowledge. Run supabase/human_bots.sql once." },
      { status: 500 }
    );
  }
}

/** DELETE /api/bots/[slug]/knowledge?id= — remove entry + file (owner + Pro). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("bot_knowledge")
    .select("id,file_path")
    .eq("id", id)
    .eq("bot_id", bot.id)
    .maybeSingle();
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  if (row.file_path) await admin.storage.from(BUCKET).remove([row.file_path]).catch(() => {});
  await admin.from("bot_knowledge").delete().eq("id", id);
  return Response.json({ ok: true });
}
