import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/logs?q=&limit= — audit log */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 200));
  try {
    const admin = createAdminSupabase();
    let query = admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    const { data } = await query;
    let rows = data ?? [];
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.action ?? "").toLowerCase().includes(q) ||
          (r.target ?? "").toLowerCase().includes(q) ||
          (r.admin_id ?? "").toLowerCase().includes(q)
      );
    }
    // Resolve admin emails for display
    const ids = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
    const emails = new Map<string, string>();
    for (const id of ids.slice(0, 50)) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (u?.user?.email) emails.set(id, u.user.email);
    }
    return Response.json({ rows: rows.map((r) => ({ ...r, admin_email: emails.get(r.admin_id) ?? r.admin_id?.slice(0, 8) })) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
