import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/subscriptions?q=&plan= — real plan data + history */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const plan = req.nextUrl.searchParams.get("plan") ?? "all";
  try {
    const admin = createAdminSupabase();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,name,email,plan,status")
      .order("plan", { ascending: false });
    let rows = profiles ?? [];
    if (plan !== "all") rows = rows.filter((r) => r.plan === plan);
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }
    const { data: events } = await admin
      .from("subscription_events")
      .select("id,user_id,from_plan,to_plan,changed_by,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return Response.json({ rows: rows.slice(0, 200), total: rows.length, events: events ?? [] });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** POST /api/admin/subscriptions {user_id, plan} — change plan (reuse users route op) */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { user_id, plan } = (await req.json()) as { user_id?: string; plan?: string };
    if (!user_id || (plan !== "plus" && plan !== "free")) {
      return Response.json({ error: "user_id and plan (free|plus) required." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    const { data: prev } = await admin.from("profiles").select("plan").eq("id", user_id).single();
    await admin.from("profiles").update({ plan }).eq("id", user_id);
    await admin.from("subscription_events").insert({
      user_id, from_plan: prev?.plan ?? "free", to_plan: plan, changed_by: adminUser.id,
    });
    await logAdminAction(adminUser.id, plan === "plus" ? "granted Plus to user" : "removed Plus from user", user_id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
