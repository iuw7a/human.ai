import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { effectiveOwnerId, getOwnedBot, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bots/[slug]/tasks — list (owner + Pro; session or companion key). */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("bot_tasks")
    .select("id,title,done,due_at,notified,created_at,updated_at")
    .eq("bot_id", bot.id)
    .order("done", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "42P01" || /relation .* does not exist/i.test(msg)) {
      return Response.json(
        { error: "Database not set up: run supabase/bots_schema.sql once in the Supabase SQL editor." },
        { status: 500 }
      );
    }
    return Response.json({ error: "Could not load tasks." }, { status: 500 });
  }
  return Response.json({ tasks: data ?? [] });
}

/** POST /api/bots/[slug]/tasks {title, due_at?} — add (owner + Pro). */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  try {
    const b = (await req.json()) as { title?: string; due_at?: string | null };
    const title = (b.title ?? "").trim().slice(0, 200);
    if (!title) return Response.json({ error: "A task title is required." }, { status: 400 });
    let due: string | null = null;
    if (b.due_at) {
      const d = new Date(b.due_at);
      if (Number.isNaN(d.getTime())) return Response.json({ error: "Invalid due date." }, { status: 400 });
      due = d.toISOString();
    }
    const admin = createAdminSupabase();
    const { data: existing } = await admin.from("bot_tasks").select("id").eq("bot_id", bot.id).eq("done", false);
    if ((existing ?? []).length >= 100) {
      return Response.json({ error: "Task list is full (100 open tasks)." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("bot_tasks")
      .insert({ bot_id: bot.id, user_id: ownerId, title, due_at: due })
      .select("id,title,done,due_at,notified,created_at")
      .single();
    if (error) throw error;
    return Response.json({ task: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if ((e as { code?: string })?.code === "42P01" || /relation .* does not exist/i.test(msg)) {
      return Response.json(
        { error: "Database not set up: run supabase/bots_schema.sql once in the Supabase SQL editor." },
        { status: 500 }
      );
    }
    return Response.json({ error: "Could not add task." }, { status: 500 });
  }
}

/** PATCH /api/bots/[slug]/tasks {id, done?, notified?, title?} (owner + Pro). */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const b = (await req.json()) as { id?: string; done?: boolean; notified?: boolean; title?: string };
  if (!b.id) return Response.json({ error: "id required." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.done !== undefined) patch.done = !!b.done;
  if (b.notified !== undefined) patch.notified = !!b.notified;
  if (b.title !== undefined) {
    const title = b.title.trim().slice(0, 200);
    if (!title) return Response.json({ error: "Title required." }, { status: 400 });
    patch.title = title;
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("bot_tasks")
    .update(patch)
    .eq("id", b.id)
    .eq("bot_id", bot.id)
    .select("id,title,done,due_at,notified")
    .single();
  if (error) return Response.json({ error: "Could not update task." }, { status: 500 });
  return Response.json({ task: data });
}

/** DELETE /api/bots/[slug]/tasks?id= (owner + Pro). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const ownerId = await effectiveOwnerId(req);
  if (!ownerId) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, ownerId);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("bot_tasks").delete().eq("id", id).eq("bot_id", bot.id);
  return Response.json({ ok: true });
}
