import { NextRequest } from "next/server";
import { getAdmin, logAdminAction, maintenanceState } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/maintenance | PUT {on, message?, starts_at?, ends_at?} */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  return Response.json(await maintenanceState());
}

export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as { on?: boolean; message?: string };
    const admin = createAdminSupabase();
    await admin.from("app_settings").upsert({ key: "maintenance", value: b.on ? "on" : "off" }, { onConflict: "key" });
    if (typeof b.message === "string" && b.message.trim()) {
      await admin.from("app_settings").upsert({ key: "maintenance_message", value: b.message.slice(0, 500) }, { onConflict: "key" });
    }
    await logAdminAction(adminUser.id, b.on ? "enabled maintenance mode" : "disabled maintenance mode");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
