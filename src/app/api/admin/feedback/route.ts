import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/feedback?status= | PATCH {id, status} */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") ?? "all";
  const admin = createAdminSupabase();
  let q = admin.from("feedback").select("*").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return Response.json({ rows: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { id, status } = (await req.json()) as { id?: string; status?: string };
    if (!id || !["open", "reviewing", "resolved"].includes(status ?? "")) {
      return Response.json({ error: "id and valid status required." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    await admin.from("feedback").update({ status }).eq("id", id);
    await logAdminAction(adminUser.id, `marked feedback ${status}`, id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
