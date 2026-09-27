import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/files?q=&type= — all uploads with owner + storage total */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const type = req.nextUrl.searchParams.get("type") ?? "all";
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("attachments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  let rows = data ?? [];
  if (type !== "all") rows = rows.filter((r) => (r.mime_type ?? "").startsWith(type));
  if (q) {
    rows = rows.filter(
      (r) => (r.storage_path ?? "").toLowerCase().includes(q) || (r.chat_id ?? "").toLowerCase().includes(q)
    );
  }
  const ownerIds = [...new Set(rows.map((r) => r.user_id))].slice(0, 100);
  const owners = new Map<string, string>();
  for (const id of ownerIds) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user?.email) owners.set(id, u.user.email);
  }
  const total = rows.reduce((s, r) => s + (r.size_bytes ?? 0), 0);
  return Response.json({
    rows: rows.map((r) => ({ ...r, owner: owners.get(r.user_id) ?? r.user_id.slice(0, 8) })),
    totalBytes: total,
  });
}

/** DELETE /api/admin/files?id= — remove storage object + row (authorized admin only) */
export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    const admin = createAdminSupabase();
    const { data: row } = await admin.from("attachments").select("storage_path").eq("id", id).single();
    if (!row) return Response.json({ error: "Not found." }, { status: 404 });
    await admin.storage.from("attachments").remove([row.storage_path]);
    await admin.from("attachments").delete().eq("id", id);
    await logAdminAction(adminUser.id, "deleted file", row.storage_path);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
