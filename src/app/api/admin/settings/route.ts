import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/settings (own profile + safe config presence) | PUT {name} */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("name,email,role,plan,created_at")
    .eq("id", adminUser.id)
    .single();
  return Response.json({
    profile,
    config: {
      nvidia_configured: !!process.env.NVIDIA_API_KEY,
      supabase_configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      app_version: "1.0.0",
    },
  });
}

export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name || !name.trim()) return Response.json({ error: "name required." }, { status: 400 });
    const admin = createAdminSupabase();
    await admin.from("profiles").update({ name: name.trim().slice(0, 80) }).eq("id", adminUser.id);
    await logAdminAction(adminUser.id, "updated own admin profile");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
