import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/security — login activity, failures, admin sessions */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 200));
  try {
    const admin = createAdminSupabase();
    const { data: events } = await admin
      .from("auth_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    const failed = (events ?? []).filter((e) => e.type === "login_failed").length;
    // Recently active admins (real: recent login/logout events by admins)
    const { data: profiles } = await admin.from("profiles").select("id,name,email").in("role", ["admin", "super_admin"]);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const recentAdmins = (events ?? [])
      .filter((e) => e.user_id && pmap.has(e.user_id) && e.type !== "login_failed")
      .slice(0, 20)
      .map((e) => ({ ...e, name: pmap.get(e.user_id)?.name, email: pmap.get(e.user_id)?.email ?? e.email }));
    return Response.json({ events: events ?? [], failed, recentAdmins });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** POST /api/admin/security {user_id} — revoke access by disabling the account (documented). */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { user_id } = (await req.json()) as { user_id?: string };
    if (!user_id) return Response.json({ error: "user_id required." }, { status: 400 });
    if (user_id === adminUser.id) return Response.json({ error: "Cannot disable yourself." }, { status: 400 });
    const admin = createAdminSupabase();
    await admin.from("profiles").update({ status: "disabled" }).eq("id", user_id);
    await logAdminAction(adminUser.id, "disabled account (session revoke)", user_id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
