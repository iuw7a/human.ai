import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const FIELDS = ["title", "description", "image_url", "destination_url", "placement", "priority", "active", "starts_at", "ends_at"] as const;

/** GET list | POST create | PUT update | DELETE ?id= */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data } = await admin.from("ads").select("*").order("priority", { ascending: false }).limit(200);
  return Response.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as Record<string, unknown>;
    if (!b.title) return Response.json({ error: "title required." }, { status: 400 });
    const admin = createAdminSupabase();
    const row: Record<string, unknown> = { created_by: adminUser.id, active: true, priority: 0 };
    for (const f of FIELDS) {
      if (b[f] !== undefined && b[f] !== "") row[f] = typeof b[f] === "string" ? (b[f] as string).slice(0, 2000) : b[f];
    }
    const { data, error } = await admin.from("ads").insert(row).select("id").single();
    if (error) throw error;
    await logAdminAction(adminUser.id, "created ad", String(data.id), { title: row.title });
    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null
          ? JSON.stringify(e).slice(0, 1000)
          : "Failed.";
    console.error("[api/admin/ads POST]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

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
    if (patch.priority !== undefined) patch.priority = Number(patch.priority) || 0;
    const { error } = await admin.from("ads").update(patch).eq("id", b.id);
    if (error) throw error;
    await logAdminAction(adminUser.id, "updated ad", b.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("ads").delete().eq("id", id);
  await logAdminAction(adminUser.id, "deleted ad", id);
  return Response.json({ ok: true });
}
