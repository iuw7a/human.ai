import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const FIELDS = ["title", "message", "image_url", "link_url", "audience", "kind", "active", "starts_at", "ends_at"] as const;

/** GET /api/admin/announcements?kind= */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const kind = req.nextUrl.searchParams.get("kind");
  const admin = createAdminSupabase();
  let q = admin.from("announcements").select("*").order("created_at", { ascending: false }).limit(200);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return Response.json({ rows: data ?? [] });
}

/** POST — create */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as Record<string, unknown>;
    if (!b.title) return Response.json({ error: "title required." }, { status: 400 });
    const admin = createAdminSupabase();
    const row: Record<string, unknown> = { created_by: adminUser.id, active: true };
    for (const f of FIELDS) {
      if (b[f] !== undefined && b[f] !== "") row[f] = typeof b[f] === "string" ? (b[f] as string).slice(0, 2000) : b[f];
    }
    if (row.kind !== "banner" && row.kind !== "modal" && row.kind !== "notice") row.kind = "banner";
    if (row.audience !== "all" && row.audience !== "free" && row.audience !== "plus") row.audience = "all";
    const { data, error } = await admin.from("announcements").insert(row).select("id").single();
    if (error) throw error;
    await logAdminAction(adminUser.id, "created announcement", String(data.id), { title: row.title });
    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** PUT {id, ...fields} — update */
export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as Record<string, unknown> & { id?: string };
    if (!b.id) return Response.json({ error: "id required." }, { status: 400 });
    const admin = createAdminSupabase();
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (b[f] !== undefined) patch[f] = typeof b[f] === "string" && b[f] !== "" ? (b[f] as string).slice(0, 2000) : b[f] === "" ? null : b[f];
    }
    const { error } = await admin.from("announcements").update(patch).eq("id", b.id);
    if (error) throw error;
    await logAdminAction(adminUser.id, "updated announcement", b.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** DELETE ?id= */
export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("announcements").delete().eq("id", id);
  await logAdminAction(adminUser.id, "deleted announcement", id);
  return Response.json({ ok: true });
}
