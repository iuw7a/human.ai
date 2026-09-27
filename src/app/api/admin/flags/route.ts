import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/flags | PUT {key, enabled} */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data } = await admin.from("feature_flags").select("*").order("key");
  return Response.json({ flags: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { key, enabled } = (await req.json()) as { key?: string; enabled?: boolean };
    if (!key) return Response.json({ error: "key required." }, { status: 400 });
    const admin = createAdminSupabase();
    await admin.from("feature_flags").update({ enabled: !!enabled, updated_at: new Date().toISOString() }).eq("key", key);
    await logAdminAction(adminUser.id, `${enabled ? "enabled" : "disabled"} feature flag`, key);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
