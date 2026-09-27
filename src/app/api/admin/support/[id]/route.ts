import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/support/[id] — ticket + messages for admins */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data: ticket } = await admin.from("support_tickets").select("*").eq("id", params.id).single();
  if (!ticket) return Response.json({ error: "Not found." }, { status: 404 });
  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .eq("ticket_id", params.id)
    .order("created_at", { ascending: true });
  const { data: u } = await admin.auth.admin.getUserById(ticket.user_id);
  return Response.json({ ticket, messages: messages ?? [], owner: u?.user?.email ?? ticket.user_id });
}
