import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/support?status= — all tickets + latest message */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") ?? "all";
  const admin = createAdminSupabase();
  let q = admin.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data: tickets } = await q;
  const ownerIds = [...new Set((tickets ?? []).map((t) => t.user_id))];
  const owners = new Map<string, string>();
  for (const id of ownerIds.slice(0, 100)) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user?.email) owners.set(id, u.user.email);
  }
  return Response.json({
    rows: (tickets ?? []).map((t) => ({ ...t, owner: owners.get(t.user_id) ?? t.user_id.slice(0, 8) })),
  });
}

/** GET /api/admin/support/[id] | POST {ticket_id, body, status?} reply */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { ticket_id, body, status } = (await req.json()) as {
      ticket_id?: string; body?: string; status?: string;
    };
    if (!ticket_id) return Response.json({ error: "ticket_id required." }, { status: 400 });
    const admin = createAdminSupabase();
    if (body && body.trim()) {
      await admin.from("support_messages").insert({
        ticket_id, sender: "admin", body: body.trim().slice(0, 5000),
      });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status && ["open", "pending", "resolved"].includes(status)) patch.status = status;
    await admin.from("support_tickets").update(patch).eq("id", ticket_id);
    await logAdminAction(adminUser.id, "replied to support ticket", ticket_id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
